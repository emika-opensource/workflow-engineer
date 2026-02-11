const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const N8N_BASE = 'http://localhost:5678';
const N8N_API = `${N8N_BASE}/api/v1`;

const DATA_DIR = fs.existsSync('/home/node/emika') ? '/home/node/emika/workflow-hub' : path.join(__dirname, 'data');
fs.ensureDirSync(DATA_DIR);

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Load templates and connectors from JSON files
const TEMPLATES = require('./data/templates.json');
const CONNECTORS = require('./data/connectors.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Config helpers ---
function getConfig() {
  try { return fs.readJsonSync(CONFIG_FILE); } catch { return { n8nApiKey: '', preferences: { theme: 'dark' }, connectedServices: [], setupComplete: false }; }
}
function saveConfig(cfg) { fs.writeJsonSync(CONFIG_FILE, cfg, { spaces: 2 }); }

// --- Human-readable error mapping ---
function humanError(msg) {
  if (!msg) return 'Unknown error';
  if (msg.includes('401')) return 'API key is missing or invalid. Go to Settings to configure it.';
  if (msg.includes('403')) return 'Access denied. Check your n8n API key permissions.';
  if (msg.includes('404')) return 'Resource not found in n8n.';
  if (msg.includes('409')) return 'Conflict — this resource may already exist or be in use.';
  if (msg.includes('ECONNREFUSED') || msg.includes('502')) return 'n8n is not responding. It may still be starting up (15-30s after boot).';
  if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) return 'n8n request timed out. It may be overloaded or starting up.';
  return msg;
}

async function n8nFetch(endpoint, opts = {}) {
  const cfg = getConfig();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (cfg.n8nApiKey) headers['X-N8N-API-KEY'] = cfg.n8nApiKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${N8N_API}${endpoint}`, { ...opts, headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) { const t = await res.text(); throw new Error(`n8n ${res.status}: ${t}`); }
    return res.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// --- Auto-configure n8n API key ---
async function autoConfigureApiKey() {
  const cfg = getConfig();
  if (cfg.n8nApiKey) return; // Already configured

  console.log('Attempting to auto-configure n8n API key...');

  // Wait for n8n to be ready (up to 60s)
  let n8nReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${N8N_BASE}/healthz`, { timeout: 3000 });
      if (res.ok) { n8nReady = true; break; }
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  if (!n8nReady) {
    console.log('n8n not ready after 60s, skipping auto-configure');
    return;
  }

  // Try to create API key via n8n's internal API
  // n8n generates an API key when you enable it via the settings
  // We'll try the owner setup flow
  try {
    // Check if n8n has been set up (has owner)
    const setupRes = await fetch(`${N8N_BASE}/api/v1/owner/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@workflow-engineer.local',
        firstName: 'Workflow',
        lastName: 'Engineer',
        password: crypto.randomBytes(16).toString('hex')
      })
    });

    if (setupRes.ok) {
      const ownerData = await setupRes.json();
      console.log('n8n owner account created');
      // The setup response may include an API key or we need to create one
      if (ownerData.apiKey) {
        cfg.n8nApiKey = ownerData.apiKey;
        cfg.setupComplete = true;
        saveConfig(cfg);
        console.log('API key auto-configured from owner setup');
        return;
      }
    }

    // Try to generate an API key via the /me endpoint with cookie auth
    // First sign in
    const loginRes = await fetch(`${N8N_BASE}/api/v1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@workflow-engineer.local',
        password: cfg._ownerPassword || ''
      })
    });

    if (loginRes.ok) {
      const cookies = loginRes.headers.raw()['set-cookie'] || [];
      const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

      // Try to create an API key
      const apiKeyRes = await fetch(`${N8N_BASE}/api/v1/me/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader }
      });

      if (apiKeyRes.ok) {
        const keyData = await apiKeyRes.json();
        if (keyData.apiKey) {
          cfg.n8nApiKey = keyData.apiKey;
          cfg.setupComplete = true;
          saveConfig(cfg);
          console.log('API key auto-configured via login flow');
          return;
        }
      }
    }
  } catch (e) {
    console.log('Auto-configure attempt failed:', e.message);
  }

  // Fallback: check if n8n is in "no auth" mode (common in containers)
  try {
    const testRes = await fetch(`${N8N_API}/workflows`);
    if (testRes.ok) {
      // n8n is running without auth - mark as configured
      cfg.setupComplete = true;
      cfg.n8nApiKey = ''; // No key needed
      saveConfig(cfg);
      console.log('n8n running without auth, no API key needed');
      return;
    }
  } catch {}

  console.log('Auto-configure: manual API key setup required');
}

// --- Status ---
app.get('/api/status', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${N8N_BASE}/healthz`, { signal: controller.signal });
    clearTimeout(timeout);
    const cfg = getConfig();
    res.json({
      n8n: r.ok ? 'running' : 'error',
      statusCode: r.status,
      configured: !!(cfg.n8nApiKey || cfg.setupComplete),
      firstRun: !cfg.setupComplete
    });
  } catch {
    res.json({ n8n: 'offline', statusCode: 0, configured: false, firstRun: true });
  }
});

// --- Workflows (proxy to n8n) ---
app.get('/api/workflows', async (req, res) => {
  try { const d = await n8nFetch('/workflows'); res.json(d); }
  catch (e) { res.status(502).json({ error: humanError(e.message) }); }
});

app.post('/api/workflows', async (req, res) => {
  try { const d = await n8nFetch('/workflows', { method: 'POST', body: JSON.stringify(req.body) }); res.json(d); }
  catch (e) { res.status(502).json({ error: humanError(e.message) }); }
});

app.get('/api/workflows/:id', async (req, res) => {
  try { const d = await n8nFetch(`/workflows/${req.params.id}`); res.json(d); }
  catch (e) { res.status(502).json({ error: humanError(e.message) }); }
});

app.put('/api/workflows/:id', async (req, res) => {
  try { const d = await n8nFetch(`/workflows/${req.params.id}`, { method: 'PUT', body: JSON.stringify(req.body) }); res.json(d); }
  catch (e) { res.status(502).json({ error: humanError(e.message) }); }
});

app.delete('/api/workflows/:id', async (req, res) => {
  try { const d = await n8nFetch(`/workflows/${req.params.id}`, { method: 'DELETE' }); res.json(d); }
  catch (e) { res.status(502).json({ error: humanError(e.message) }); }
});

app.post('/api/workflows/:id/activate', async (req, res) => {
  try { const d = await n8nFetch(`/workflows/${req.params.id}/activate`, { method: 'POST' }); res.json(d); }
  catch (e) { res.status(502).json({ error: humanError(e.message) }); }
});

app.post('/api/workflows/:id/deactivate', async (req, res) => {
  try { const d = await n8nFetch(`/workflows/${req.params.id}/deactivate`, { method: 'POST' }); res.json(d); }
  catch (e) { res.status(502).json({ error: humanError(e.message) }); }
});

app.post('/api/workflows/:id/execute', async (req, res) => {
  try { const d = await n8nFetch(`/workflows/${req.params.id}/run`, { method: 'POST', body: JSON.stringify(req.body || {}) }); res.json(d); }
  catch (e) { res.status(502).json({ error: humanError(e.message) }); }
});

// --- Executions ---
app.get('/api/executions', async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const d = await n8nFetch(`/executions${qs ? '?' + qs : ''}`);
    res.json(d);
  } catch (e) { res.status(502).json({ error: humanError(e.message) }); }
});

app.get('/api/executions/:id', async (req, res) => {
  try { const d = await n8nFetch(`/executions/${req.params.id}`); res.json(d); }
  catch (e) { res.status(502).json({ error: humanError(e.message) }); }
});

// --- Analytics (FIXED: success/error detection) ---
app.get('/api/analytics', async (req, res) => {
  try {
    const workflows = await n8nFetch('/workflows');
    const wfList = workflows.data || [];

    let exList = [];
    let execError = null;
    try {
      const executions = await n8nFetch('/executions?limit=100');
      exList = executions.data || [];
    } catch (e) {
      execError = e.message;
    }

    const active = wfList.filter(w => w.active).length;
    // FIX: n8n sets stoppedAt for ALL completed executions.
    // finished=true means success, finished=false means error.
    const success = exList.filter(e => e.finished === true).length;
    const errors = exList.filter(e => e.finished === false).length;

    res.json({
      totalWorkflows: wfList.length,
      activeWorkflows: active,
      totalExecutions: exList.length,
      successCount: success,
      errorCount: errors,
      successRate: exList.length ? Math.round((success / exList.length) * 100) : 0,
      recentExecutions: exList.slice(0, 20),
      execError
    });
  } catch (e) { res.status(502).json({ error: humanError(e.message) }); }
});

// --- Config (with input validation) ---
app.get('/api/config', (req, res) => {
  const cfg = getConfig();
  res.json({ ...cfg, n8nApiKey: cfg.n8nApiKey ? '****' + cfg.n8nApiKey.slice(-4) : '', _ownerPassword: undefined });
});

app.put('/api/config', (req, res) => {
  const cfg = getConfig();
  const allowed = ['n8nApiKey', 'preferences', 'connectedServices', 'setupComplete'];
  for (const key of Object.keys(req.body)) {
    if (!allowed.includes(key)) continue;
    if (key === 'n8nApiKey' && typeof req.body.n8nApiKey === 'string') {
      cfg.n8nApiKey = req.body.n8nApiKey.trim();
    } else if (key === 'preferences' && typeof req.body.preferences === 'object' && req.body.preferences !== null) {
      cfg.preferences = { ...cfg.preferences, ...req.body.preferences };
    } else if (key === 'connectedServices' && Array.isArray(req.body.connectedServices)) {
      cfg.connectedServices = req.body.connectedServices;
    } else if (key === 'setupComplete' && typeof req.body.setupComplete === 'boolean') {
      cfg.setupComplete = req.body.setupComplete;
    }
  }
  saveConfig(cfg);
  res.json({ ok: true });
});

// --- Templates ---
app.get('/api/templates', (req, res) => {
  const cat = req.query.category;
  let list = TEMPLATES.map(({ n8nJson, ...rest }) => rest);
  if (cat && cat !== 'all') list = list.filter(t => t.category === cat);
  res.json(list);
});

app.get('/api/templates/:id', (req, res) => {
  const t = TEMPLATES.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  res.json(t);
});

app.post('/api/templates/:id/deploy', async (req, res) => {
  const t = TEMPLATES.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  try {
    const d = await n8nFetch('/workflows', { method: 'POST', body: JSON.stringify(t.n8nJson) });

    // Determine if this template has a webhook trigger and build the webhook URL
    const webhookNode = t.n8nJson.nodes.find(n => n.type === 'n8n-nodes-base.webhook');
    let webhookUrl = null;
    if (webhookNode && webhookNode.parameters && webhookNode.parameters.path) {
      webhookUrl = `http://localhost:5678/webhook-test/${webhookNode.parameters.path}`;
      const productionUrl = `http://localhost:5678/webhook/${webhookNode.parameters.path}`;
      webhookUrl = { test: webhookUrl, production: productionUrl };
    }

    // Determine which credentials are needed
    const credentialsNeeded = [];
    for (const node of t.n8nJson.nodes) {
      if (node.type === 'n8n-nodes-base.webhook' || node.type === 'n8n-nodes-base.scheduleTrigger') continue;
      const connector = CONNECTORS.find(c => c.n8nNodeName === node.type);
      if (connector) credentialsNeeded.push({ node: node.name, connector: connector.name, authType: connector.authType });
    }

    res.json({ ok: true, workflow: d, webhookUrl, credentialsNeeded });
  } catch (e) { res.status(502).json({ error: humanError(e.message) }); }
});

// --- Connectors ---
app.get('/api/connectors', (req, res) => {
  const cat = req.query.category;
  let list = CONNECTORS;
  if (cat && cat !== 'all') list = list.filter(c => c.category === cat);
  if (req.query.search) {
    const s = req.query.search.toLowerCase();
    list = list.filter(c => c.name.toLowerCase().includes(s) || c.description.toLowerCase().includes(s));
  }
  res.json(list);
});

app.get('/api/connectors/:name', (req, res) => {
  const c = CONNECTORS.find(c => c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === req.params.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (!c) return res.status(404).json({ error: 'Connector not found' });
  res.json(c);
});

// --- SPA fallback ---
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- Start server and auto-configure ---
app.listen(PORT, () => {
  console.log(`Workflow Engineer dashboard on port ${PORT}`);
  // Auto-configure in background (don't block startup)
  autoConfigureApiKey().catch(e => console.log('Auto-configure error:', e.message));
});
