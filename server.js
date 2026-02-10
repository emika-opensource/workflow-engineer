const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const N8N_BASE = 'http://localhost:5678';
const N8N_API = `${N8N_BASE}/api/v1`;

const DATA_DIR = fs.existsSync('/home/node/emika') ? '/home/node/emika/workflow-hub' : path.join(__dirname, 'data');
fs.ensureDirSync(DATA_DIR);

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Config helpers ---
function getConfig() {
  try { return fs.readJsonSync(CONFIG_FILE); } catch { return { n8nApiKey: '', preferences: { theme: 'dark' }, connectedServices: [] }; }
}
function saveConfig(cfg) { fs.writeJsonSync(CONFIG_FILE, cfg, { spaces: 2 }); }

async function n8nFetch(endpoint, opts = {}) {
  const cfg = getConfig();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (cfg.n8nApiKey) headers['X-N8N-API-KEY'] = cfg.n8nApiKey;
  const res = await fetch(`${N8N_API}${endpoint}`, { ...opts, headers });
  if (!res.ok) { const t = await res.text(); throw new Error(`n8n ${res.status}: ${t}`); }
  return res.json();
}

// --- Status ---
app.get('/api/status', async (req, res) => {
  try {
    const r = await fetch(`${N8N_BASE}/healthz`, { timeout: 3000 });
    res.json({ n8n: r.ok ? 'running' : 'error', statusCode: r.status });
  } catch {
    res.json({ n8n: 'offline', statusCode: 0 });
  }
});

// --- Workflows (proxy to n8n) ---
app.get('/api/workflows', async (req, res) => {
  try { const d = await n8nFetch('/workflows'); res.json(d); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.post('/api/workflows', async (req, res) => {
  try { const d = await n8nFetch('/workflows', { method: 'POST', body: JSON.stringify(req.body) }); res.json(d); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/workflows/:id', async (req, res) => {
  try { const d = await n8nFetch(`/workflows/${req.params.id}`); res.json(d); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.put('/api/workflows/:id', async (req, res) => {
  try { const d = await n8nFetch(`/workflows/${req.params.id}`, { method: 'PUT', body: JSON.stringify(req.body) }); res.json(d); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.post('/api/workflows/:id/activate', async (req, res) => {
  try { const d = await n8nFetch(`/workflows/${req.params.id}/activate`, { method: 'POST' }); res.json(d); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.post('/api/workflows/:id/deactivate', async (req, res) => {
  try { const d = await n8nFetch(`/workflows/${req.params.id}/deactivate`, { method: 'POST' }); res.json(d); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.post('/api/workflows/:id/execute', async (req, res) => {
  try { const d = await n8nFetch(`/workflows/${req.params.id}/run`, { method: 'POST', body: JSON.stringify(req.body || {}) }); res.json(d); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

// --- Executions ---
app.get('/api/executions', async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const d = await n8nFetch(`/executions${qs ? '?' + qs : ''}`);
    res.json(d);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/executions/:id', async (req, res) => {
  try { const d = await n8nFetch(`/executions/${req.params.id}`); res.json(d); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

// --- Analytics ---
app.get('/api/analytics', async (req, res) => {
  try {
    const workflows = await n8nFetch('/workflows');
    const executions = await n8nFetch('/executions?limit=100');
    const wfList = workflows.data || [];
    const exList = executions.data || [];
    const active = wfList.filter(w => w.active).length;
    const success = exList.filter(e => e.finished && !e.stoppedAt).length;
    const errors = exList.filter(e => e.stoppedAt).length;
    res.json({
      totalWorkflows: wfList.length,
      activeWorkflows: active,
      totalExecutions: exList.length,
      successCount: success,
      errorCount: errors,
      successRate: exList.length ? Math.round((success / exList.length) * 100) : 0,
      recentExecutions: exList.slice(0, 20)
    });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// --- Config ---
app.get('/api/config', (req, res) => {
  const cfg = getConfig();
  res.json({ ...cfg, n8nApiKey: cfg.n8nApiKey ? '****' + cfg.n8nApiKey.slice(-4) : '' });
});

app.put('/api/config', (req, res) => {
  const cfg = getConfig();
  if (req.body.n8nApiKey !== undefined) cfg.n8nApiKey = req.body.n8nApiKey;
  if (req.body.preferences) cfg.preferences = { ...cfg.preferences, ...req.body.preferences };
  if (req.body.connectedServices) cfg.connectedServices = req.body.connectedServices;
  saveConfig(cfg);
  res.json({ ok: true });
});

// --- Templates ---
const TEMPLATES = [
  {
    id: 'lead-to-crm', name: 'Lead to CRM', category: 'crm',
    description: 'Capture leads via webhook, enrich with company data, and push to your CRM automatically.',
    complexity: 'beginner', triggers: ['Webhook'], actions: ['HTTP Request', 'HubSpot'],
    n8nJson: {
      name: 'Lead to CRM', nodes: [
        { parameters: { httpMethod: 'POST', path: 'lead-capture', responseMode: 'onReceived' }, id: 'n1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 1, position: [240, 300] },
        { parameters: { url: 'https://api.clearbit.com/v2/companies/find?domain={{$json.domain}}', method: 'GET', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth' }, id: 'n2', name: 'Enrich Data', type: 'n8n-nodes-base.httpRequest', typeVersion: 3, position: [460, 300] },
        { parameters: { resource: 'contact', operation: 'create', additionalFields: { company: '={{$json.name}}', email: '={{$node["Webhook"].json.email}}', firstname: '={{$node["Webhook"].json.firstName}}', lastname: '={{$node["Webhook"].json.lastName}}' } }, id: 'n3', name: 'Create CRM Contact', type: 'n8n-nodes-base.hubspot', typeVersion: 1, position: [680, 300] }
      ],
      connections: { 'Webhook': { main: [[{ node: 'Enrich Data', type: 'main', index: 0 }]] }, 'Enrich Data': { main: [[{ node: 'Create CRM Contact', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' }
    }
  },
  {
    id: 'email-responder', name: 'Email Responder', category: 'communication',
    description: 'Automatically classify incoming emails with AI and send contextual auto-replies.',
    complexity: 'intermediate', triggers: ['IMAP Email'], actions: ['OpenAI', 'Send Email'],
    n8nJson: {
      name: 'Email Responder', nodes: [
        { parameters: { mailbox: 'INBOX', options: {} }, id: 'n1', name: 'Email Trigger', type: 'n8n-nodes-base.imapEmail', typeVersion: 2, position: [240, 300] },
        { parameters: { resource: 'chat', operation: 'message', model: 'gpt-4', messages: { values: [{ content: 'Classify this email as support/sales/spam and draft a reply:\n\nSubject: {{$json.subject}}\nBody: {{$json.text}}' }] } }, id: 'n2', name: 'AI Classify', type: '@n8n/n8n-nodes-langchain.openAi', typeVersion: 1, position: [460, 300] },
        { parameters: { fromEmail: 'noreply@company.com', toEmail: '={{$node["Email Trigger"].json.from}}', subject: 'Re: {{$node["Email Trigger"].json.subject}}', text: '={{$json.message.content}}' }, id: 'n3', name: 'Send Reply', type: 'n8n-nodes-base.emailSend', typeVersion: 2, position: [680, 300] }
      ],
      connections: { 'Email Trigger': { main: [[{ node: 'AI Classify', type: 'main', index: 0 }]] }, 'AI Classify': { main: [[{ node: 'Send Reply', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' }
    }
  },
  {
    id: 'slack-notifier', name: 'Slack Notifier', category: 'communication',
    description: 'Monitor RSS feeds and post filtered updates to Slack channels automatically.',
    complexity: 'beginner', triggers: ['RSS Feed'], actions: ['IF', 'Slack'],
    n8nJson: {
      name: 'Slack Notifier', nodes: [
        { parameters: { url: 'https://example.com/feed.xml', options: {} }, id: 'n1', name: 'RSS Feed', type: 'n8n-nodes-base.rssFeedRead', typeVersion: 1, position: [240, 300] },
        { parameters: { conditions: { string: [{ value1: '={{$json.title}}', operation: 'contains', value2: 'important' }] } }, id: 'n2', name: 'Filter', type: 'n8n-nodes-base.if', typeVersion: 1, position: [460, 300] },
        { parameters: { channel: '#notifications', text: ':newspaper: *{{$json.title}}*\n{{$json.link}}', authentication: 'oAuth2' }, id: 'n3', name: 'Slack', type: 'n8n-nodes-base.slack', typeVersion: 2, position: [680, 300] }
      ],
      connections: { 'RSS Feed': { main: [[{ node: 'Filter', type: 'main', index: 0 }]] }, 'Filter': { main: [[{ node: 'Slack', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' }
    }
  },
  {
    id: 'data-sync', name: 'Data Sync', category: 'data',
    description: 'Scheduled sync from Google Sheets to a database, keeping your data sources aligned.',
    complexity: 'intermediate', triggers: ['Schedule'], actions: ['Google Sheets', 'Postgres'],
    n8nJson: {
      name: 'Data Sync', nodes: [
        { parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } }, id: 'n1', name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1, position: [240, 300] },
        { parameters: { operation: 'read', sheetId: { value: '' }, range: 'Sheet1' }, id: 'n2', name: 'Read Sheet', type: 'n8n-nodes-base.googleSheets', typeVersion: 4, position: [460, 300] },
        { parameters: { operation: 'upsert', table: 'records', columns: 'id,name,email,status', schema: 'public' }, id: 'n3', name: 'Update DB', type: 'n8n-nodes-base.postgres', typeVersion: 2, position: [680, 300] }
      ],
      connections: { 'Schedule': { main: [[{ node: 'Read Sheet', type: 'main', index: 0 }]] }, 'Read Sheet': { main: [[{ node: 'Update DB', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' }
    }
  },
  {
    id: 'social-monitor', name: 'Social Monitor', category: 'marketing',
    description: 'Periodically scrape social mentions and alert your team on Slack when your brand is mentioned.',
    complexity: 'intermediate', triggers: ['Schedule'], actions: ['HTTP Request', 'Slack'],
    n8nJson: {
      name: 'Social Monitor', nodes: [
        { parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 30 }] } }, id: 'n1', name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1, position: [240, 300] },
        { parameters: { url: 'https://api.twitter.com/2/tweets/search/recent?query=yourcompany', method: 'GET', authentication: 'genericCredentialType' }, id: 'n2', name: 'Check Mentions', type: 'n8n-nodes-base.httpRequest', typeVersion: 3, position: [460, 300] },
        { parameters: { channel: '#social-alerts', text: 'New mention: {{$json.text}}\nBy: @{{$json.author}}', authentication: 'oAuth2' }, id: 'n3', name: 'Slack Alert', type: 'n8n-nodes-base.slack', typeVersion: 2, position: [680, 300] }
      ],
      connections: { 'Schedule': { main: [[{ node: 'Check Mentions', type: 'main', index: 0 }]] }, 'Check Mentions': { main: [[{ node: 'Slack Alert', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' }
    }
  },
  {
    id: 'invoice-processor', name: 'Invoice Processor', category: 'data',
    description: 'Receive invoice emails, extract PDF data with AI, and log to Google Sheets.',
    complexity: 'advanced', triggers: ['IMAP Email'], actions: ['OpenAI', 'Google Sheets'],
    n8nJson: {
      name: 'Invoice Processor', nodes: [
        { parameters: { mailbox: 'INBOX', options: { searchCriteria: 'SUBJECT "invoice"' } }, id: 'n1', name: 'Email Trigger', type: 'n8n-nodes-base.imapEmail', typeVersion: 2, position: [240, 300] },
        { parameters: { resource: 'chat', operation: 'message', model: 'gpt-4', messages: { values: [{ content: 'Extract invoice number, date, total amount, vendor name from this email:\n\n{{$json.text}}' }] } }, id: 'n2', name: 'Extract Data', type: '@n8n/n8n-nodes-langchain.openAi', typeVersion: 1, position: [460, 300] },
        { parameters: { operation: 'append', sheetId: { value: '' }, range: 'Invoices', columns: { mappingMode: 'autoMapInputData' } }, id: 'n3', name: 'Log to Sheet', type: 'n8n-nodes-base.googleSheets', typeVersion: 4, position: [680, 300] }
      ],
      connections: { 'Email Trigger': { main: [[{ node: 'Extract Data', type: 'main', index: 0 }]] }, 'Extract Data': { main: [[{ node: 'Log to Sheet', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' }
    }
  },
  {
    id: 'customer-onboarding', name: 'Customer Onboarding', category: 'crm',
    description: 'Full onboarding sequence: welcome email, task creation, and team notification on new signups.',
    complexity: 'advanced', triggers: ['Webhook'], actions: ['Send Email', 'Asana', 'Slack'],
    n8nJson: {
      name: 'Customer Onboarding', nodes: [
        { parameters: { httpMethod: 'POST', path: 'new-customer', responseMode: 'onReceived' }, id: 'n1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 1, position: [240, 300] },
        { parameters: { fromEmail: 'welcome@company.com', toEmail: '={{$json.email}}', subject: 'Welcome to our platform!', text: 'Hi {{$json.name}}, welcome aboard!' }, id: 'n2', name: 'Welcome Email', type: 'n8n-nodes-base.emailSend', typeVersion: 2, position: [460, 200] },
        { parameters: { resource: 'task', operation: 'create', name: 'Onboard: {{$json.name}}', workspace: '', projects: [] }, id: 'n3', name: 'Create Task', type: 'n8n-nodes-base.asana', typeVersion: 1, position: [460, 400] },
        { parameters: { channel: '#new-customers', text: 'New customer: {{$json.name}} ({{$json.email}})', authentication: 'oAuth2' }, id: 'n4', name: 'Notify Team', type: 'n8n-nodes-base.slack', typeVersion: 2, position: [680, 300] }
      ],
      connections: { 'Webhook': { main: [[{ node: 'Welcome Email', type: 'main', index: 0 }, { node: 'Create Task', type: 'main', index: 0 }]] }, 'Welcome Email': { main: [[{ node: 'Notify Team', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' }
    }
  },
  {
    id: 'content-pipeline', name: 'Content Pipeline', category: 'marketing',
    description: 'Scheduled AI content generation with review queue and automatic CMS publishing.',
    complexity: 'advanced', triggers: ['Schedule'], actions: ['OpenAI', 'HTTP Request'],
    n8nJson: {
      name: 'Content Pipeline', nodes: [
        { parameters: { rule: { interval: [{ field: 'days', daysInterval: 1 }] } }, id: 'n1', name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1, position: [240, 300] },
        { parameters: { resource: 'chat', operation: 'message', model: 'gpt-4', messages: { values: [{ content: 'Write a short blog post about automation trends.' }] } }, id: 'n2', name: 'Generate Content', type: '@n8n/n8n-nodes-langchain.openAi', typeVersion: 1, position: [460, 300] },
        { parameters: { url: 'https://your-cms.com/api/posts', method: 'POST', body: '{"title":"{{$json.title}}","content":"{{$json.message.content}}","status":"draft"}' }, id: 'n3', name: 'Post to CMS', type: 'n8n-nodes-base.httpRequest', typeVersion: 3, position: [680, 300] }
      ],
      connections: { 'Schedule': { main: [[{ node: 'Generate Content', type: 'main', index: 0 }]] }, 'Generate Content': { main: [[{ node: 'Post to CMS', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' }
    }
  },
  {
    id: 'error-alert', name: 'Error Alert', category: 'dev',
    description: 'Receive error webhooks, evaluate thresholds, and alert via PagerDuty or Slack.',
    complexity: 'intermediate', triggers: ['Webhook'], actions: ['IF', 'Slack'],
    n8nJson: {
      name: 'Error Alert', nodes: [
        { parameters: { httpMethod: 'POST', path: 'error-hook', responseMode: 'onReceived' }, id: 'n1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 1, position: [240, 300] },
        { parameters: { conditions: { number: [{ value1: '={{$json.errorCount}}', operation: 'largerEqual', value2: 5 }] } }, id: 'n2', name: 'Check Threshold', type: 'n8n-nodes-base.if', typeVersion: 1, position: [460, 300] },
        { parameters: { channel: '#alerts', text: 'ALERT: {{$json.service}} has {{$json.errorCount}} errors!\n{{$json.message}}', authentication: 'oAuth2' }, id: 'n3', name: 'Slack Alert', type: 'n8n-nodes-base.slack', typeVersion: 2, position: [680, 300] }
      ],
      connections: { 'Webhook': { main: [[{ node: 'Check Threshold', type: 'main', index: 0 }]] }, 'Check Threshold': { main: [[{ node: 'Slack Alert', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' }
    }
  },
  {
    id: 'meeting-summary', name: 'Meeting Summary', category: 'communication',
    description: 'Capture meeting notes from calendar events, summarize with AI, and email participants.',
    complexity: 'intermediate', triggers: ['Schedule'], actions: ['Google Calendar', 'OpenAI', 'Send Email'],
    n8nJson: {
      name: 'Meeting Summary', nodes: [
        { parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } }, id: 'n1', name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1, position: [240, 300] },
        { parameters: { resource: 'event', operation: 'getAll', calendar: 'primary', returnAll: false, limit: 5, options: { timeMin: '={{$now.minus(1, "hour").toISO()}}', timeMax: '={{$now.toISO()}}' } }, id: 'n2', name: 'Get Events', type: 'n8n-nodes-base.googleCalendar', typeVersion: 3, position: [460, 300] },
        { parameters: { resource: 'chat', operation: 'message', model: 'gpt-4', messages: { values: [{ content: 'Summarize key points and action items from this meeting: {{$json.summary}} - {{$json.description}}' }] } }, id: 'n3', name: 'Summarize', type: '@n8n/n8n-nodes-langchain.openAi', typeVersion: 1, position: [680, 300] },
        { parameters: { fromEmail: 'meetings@company.com', toEmail: '={{$node["Get Events"].json.attendees[0].email}}', subject: 'Meeting Summary: {{$node["Get Events"].json.summary}}', text: '={{$json.message.content}}' }, id: 'n4', name: 'Email Summary', type: 'n8n-nodes-base.emailSend', typeVersion: 2, position: [900, 300] }
      ],
      connections: { 'Schedule': { main: [[{ node: 'Get Events', type: 'main', index: 0 }]] }, 'Get Events': { main: [[{ node: 'Summarize', type: 'main', index: 0 }]] }, 'Summarize': { main: [[{ node: 'Email Summary', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' }
    }
  },
  {
    id: 'inventory-tracker', name: 'Inventory Tracker', category: 'data',
    description: 'Check stock levels on a schedule, alert when low, and trigger reorder via API.',
    complexity: 'advanced', triggers: ['Schedule'], actions: ['HTTP Request', 'IF', 'Slack'],
    n8nJson: {
      name: 'Inventory Tracker', nodes: [
        { parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 6 }] } }, id: 'n1', name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1, position: [240, 300] },
        { parameters: { url: 'https://api.inventory.com/stock', method: 'GET' }, id: 'n2', name: 'Check Stock', type: 'n8n-nodes-base.httpRequest', typeVersion: 3, position: [460, 300] },
        { parameters: { conditions: { number: [{ value1: '={{$json.quantity}}', operation: 'smallerEqual', value2: 10 }] } }, id: 'n3', name: 'Low Stock?', type: 'n8n-nodes-base.if', typeVersion: 1, position: [680, 300] },
        { parameters: { channel: '#inventory', text: 'LOW STOCK: {{$json.productName}} — only {{$json.quantity}} remaining', authentication: 'oAuth2' }, id: 'n4', name: 'Alert', type: 'n8n-nodes-base.slack', typeVersion: 2, position: [900, 200] },
        { parameters: { url: 'https://api.supplier.com/reorder', method: 'POST', body: '{"sku":"{{$json.sku}}","quantity":100}' }, id: 'n5', name: 'Reorder', type: 'n8n-nodes-base.httpRequest', typeVersion: 3, position: [900, 400] }
      ],
      connections: { 'Schedule': { main: [[{ node: 'Check Stock', type: 'main', index: 0 }]] }, 'Check Stock': { main: [[{ node: 'Low Stock?', type: 'main', index: 0 }]] }, 'Low Stock?': { main: [[{ node: 'Alert', type: 'main', index: 0 }, { node: 'Reorder', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' }
    }
  },
  {
    id: 'support-ticket-router', name: 'Support Ticket Router', category: 'communication',
    description: 'Classify incoming support tickets with AI, assign priority, route to the right team.',
    complexity: 'advanced', triggers: ['Webhook'], actions: ['OpenAI', 'Slack', 'HTTP Request'],
    n8nJson: {
      name: 'Support Ticket Router', nodes: [
        { parameters: { httpMethod: 'POST', path: 'support-ticket', responseMode: 'onReceived' }, id: 'n1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 1, position: [240, 300] },
        { parameters: { resource: 'chat', operation: 'message', model: 'gpt-4', messages: { values: [{ content: 'Classify this support ticket. Return JSON with "priority" (P1/P2/P3), "team" (billing/technical/general), "summary".\n\nTicket: {{$json.subject}}\n{{$json.body}}' }] } }, id: 'n2', name: 'AI Classify', type: '@n8n/n8n-nodes-langchain.openAi', typeVersion: 1, position: [460, 300] },
        { parameters: { channel: '#support-{{$json.team}}', text: '[{{$json.priority}}] {{$json.summary}}\nFrom: {{$node["Webhook"].json.email}}', authentication: 'oAuth2' }, id: 'n3', name: 'Route to Team', type: 'n8n-nodes-base.slack', typeVersion: 2, position: [680, 300] }
      ],
      connections: { 'Webhook': { main: [[{ node: 'AI Classify', type: 'main', index: 0 }]] }, 'AI Classify': { main: [[{ node: 'Route to Team', type: 'main', index: 0 }]] } },
      settings: { executionOrder: 'v1' }
    }
  }
];

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
    res.json({ ok: true, workflow: d });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// --- Connectors ---
const CONNECTORS = [
  { name: 'Slack', description: 'Team messaging and notifications', category: 'communication', authType: 'OAuth2', n8nNodeName: 'n8n-nodes-base.slack', setupSteps: ['Create a Slack App at api.slack.com', 'Enable OAuth & add scopes: chat:write, channels:read', 'Install to workspace and copy Bot Token', 'In n8n, create Slack OAuth2 credential with Client ID and Secret'], exampleUse: 'Send notifications, read channels, manage messages' },
  { name: 'Discord', description: 'Community and team chat platform', category: 'communication', authType: 'Webhook/Bot Token', n8nNodeName: 'n8n-nodes-base.discord', setupSteps: ['Create a Discord Application at discord.com/developers', 'Add a Bot and copy the token', 'Enable required Intents (Message Content)', 'In n8n, use Discord credential with Bot Token'], exampleUse: 'Post messages, manage channels, react to events' },
  { name: 'Telegram', description: 'Messaging app with bot API', category: 'communication', authType: 'API Token', n8nNodeName: 'n8n-nodes-base.telegram', setupSteps: ['Message @BotFather on Telegram', 'Create new bot with /newbot', 'Copy the API token', 'In n8n, create Telegram credential with the token'], exampleUse: 'Send messages, receive commands, inline keyboards' },
  { name: 'Email (IMAP)', description: 'Receive and process emails', category: 'communication', authType: 'IMAP Credentials', n8nNodeName: 'n8n-nodes-base.imapEmail', setupSteps: ['Get IMAP server details from your email provider', 'Enable IMAP access (Gmail: Settings > Forwarding and POP/IMAP)', 'For Gmail, generate an App Password', 'In n8n, create IMAP credential with host, port, user, password'], exampleUse: 'Trigger workflows on new emails, process attachments' },
  { name: 'Twilio', description: 'SMS and voice communication', category: 'communication', authType: 'API Key', n8nNodeName: 'n8n-nodes-base.twilio', setupSteps: ['Sign up at twilio.com', 'Get Account SID and Auth Token from Console', 'Buy a phone number', 'In n8n, create Twilio credential with SID and Auth Token'], exampleUse: 'Send SMS, make calls, receive messages via webhook' },
  { name: 'HubSpot', description: 'CRM, marketing, and sales platform', category: 'crm', authType: 'OAuth2 / API Key', n8nNodeName: 'n8n-nodes-base.hubspot', setupSteps: ['Go to HubSpot Developer portal', 'Create a Private App with required scopes', 'Copy the Access Token', 'In n8n, create HubSpot credential (API Key or OAuth2)'], exampleUse: 'Create contacts, manage deals, sync CRM data' },
  { name: 'Salesforce', description: 'Enterprise CRM platform', category: 'crm', authType: 'OAuth2', n8nNodeName: 'n8n-nodes-base.salesforce', setupSteps: ['Create a Connected App in Salesforce Setup', 'Enable OAuth with required scopes', 'Copy Consumer Key and Consumer Secret', 'In n8n, create Salesforce OAuth2 credential'], exampleUse: 'Manage leads, contacts, opportunities, custom objects' },
  { name: 'Pipedrive', description: 'Sales CRM and pipeline management', category: 'crm', authType: 'API Token', n8nNodeName: 'n8n-nodes-base.pipedrive', setupSteps: ['Go to Pipedrive Settings > Personal Preferences > API', 'Copy your personal API token', 'In n8n, create Pipedrive credential with the token'], exampleUse: 'Manage deals, contacts, activities, pipelines' },
  { name: 'Notion', description: 'All-in-one workspace and database', category: 'project', authType: 'OAuth2 / Internal Integration', n8nNodeName: 'n8n-nodes-base.notion', setupSteps: ['Go to notion.so/my-integrations', 'Create a new integration', 'Copy the Internal Integration Token', 'Share target pages/databases with the integration', 'In n8n, create Notion credential with the token'], exampleUse: 'Create pages, query databases, update properties' },
  { name: 'Asana', description: 'Project and task management', category: 'project', authType: 'OAuth2 / PAT', n8nNodeName: 'n8n-nodes-base.asana', setupSteps: ['Go to Asana Developer Console', 'Create a Personal Access Token', 'In n8n, create Asana credential with the token'], exampleUse: 'Create tasks, manage projects, track progress' },
  { name: 'Trello', description: 'Kanban-style project boards', category: 'project', authType: 'API Key + Token', n8nNodeName: 'n8n-nodes-base.trello', setupSteps: ['Go to trello.com/power-ups/admin', 'Create a new Power-Up to get API key', 'Generate a Token via the authorization URL', 'In n8n, create Trello credential with Key and Token'], exampleUse: 'Create cards, move between lists, add comments' },
  { name: 'Linear', description: 'Modern issue tracking for teams', category: 'project', authType: 'API Key / OAuth2', n8nNodeName: 'n8n-nodes-base.linear', setupSteps: ['Go to Linear Settings > API', 'Create a Personal API Key', 'In n8n, create Linear credential with the key'], exampleUse: 'Create issues, manage projects, track cycles' },
  { name: 'Jira', description: 'Issue and project tracking', category: 'project', authType: 'Basic Auth / OAuth2', n8nNodeName: 'n8n-nodes-base.jira', setupSteps: ['Go to Atlassian API Tokens page', 'Create a new API token', 'In n8n, use email + API token as Basic Auth', 'Set your Jira domain (yoursite.atlassian.net)'], exampleUse: 'Create issues, transition statuses, search with JQL' },
  { name: 'Google Sheets', description: 'Spreadsheet data management', category: 'data', authType: 'OAuth2 / Service Account', n8nNodeName: 'n8n-nodes-base.googleSheets', setupSteps: ['Go to Google Cloud Console', 'Enable Google Sheets API', 'Create OAuth2 credentials or Service Account', 'In n8n, create Google Sheets OAuth2 credential and authorize'], exampleUse: 'Read/write rows, append data, update cells' },
  { name: 'Airtable', description: 'Flexible database and spreadsheet hybrid', category: 'data', authType: 'API Key / PAT', n8nNodeName: 'n8n-nodes-base.airtable', setupSteps: ['Go to airtable.com/create/tokens', 'Create a Personal Access Token with required scopes', 'In n8n, create Airtable credential with the token'], exampleUse: 'CRUD records, filter views, link tables' },
  { name: 'PostgreSQL', description: 'Open-source relational database', category: 'data', authType: 'Connection String', n8nNodeName: 'n8n-nodes-base.postgres', setupSteps: ['Get your PostgreSQL host, port, database name', 'Create a user with appropriate permissions', 'In n8n, create Postgres credential with host, port, database, user, password'], exampleUse: 'Query data, insert/update records, run SQL' },
  { name: 'MongoDB', description: 'NoSQL document database', category: 'data', authType: 'Connection String', n8nNodeName: 'n8n-nodes-base.mongoDb', setupSteps: ['Get your MongoDB connection string (Atlas or self-hosted)', 'Ensure network access is configured', 'In n8n, create MongoDB credential with connection string'], exampleUse: 'Find, insert, update, aggregate documents' },
  { name: 'MySQL', description: 'Popular relational database', category: 'data', authType: 'Connection Credentials', n8nNodeName: 'n8n-nodes-base.mySql', setupSteps: ['Get MySQL host, port, database name', 'Create a user with required permissions', 'In n8n, create MySQL credential with connection details'], exampleUse: 'Run queries, manage records, join tables' },
  { name: 'AWS S3', description: 'Cloud object storage', category: 'cloud', authType: 'Access Key + Secret', n8nNodeName: 'n8n-nodes-base.awsS3', setupSteps: ['Create an IAM user in AWS Console', 'Attach S3 permissions policy', 'Generate Access Key ID and Secret Access Key', 'In n8n, create AWS credential with the keys'], exampleUse: 'Upload/download files, list objects, manage buckets' },
  { name: 'Google Drive', description: 'Cloud file storage and sharing', category: 'cloud', authType: 'OAuth2', n8nNodeName: 'n8n-nodes-base.googleDrive', setupSteps: ['Enable Google Drive API in Cloud Console', 'Create OAuth2 credentials', 'In n8n, create Google Drive OAuth2 credential and authorize'], exampleUse: 'Upload files, create folders, share documents' },
  { name: 'Dropbox', description: 'Cloud file hosting', category: 'cloud', authType: 'OAuth2', n8nNodeName: 'n8n-nodes-base.dropbox', setupSteps: ['Create an app at dropbox.com/developers', 'Choose scoped access with required permissions', 'Copy App Key and App Secret', 'In n8n, create Dropbox OAuth2 credential'], exampleUse: 'Upload/download files, sync folders' },
  { name: 'Mailchimp', description: 'Email marketing platform', category: 'marketing', authType: 'API Key / OAuth2', n8nNodeName: 'n8n-nodes-base.mailchimp', setupSteps: ['Go to Mailchimp Account > Extras > API Keys', 'Create a new API key', 'Note the data center from your API key (e.g., us19)', 'In n8n, create Mailchimp credential with the key'], exampleUse: 'Add subscribers, send campaigns, manage lists' },
  { name: 'SendGrid', description: 'Email delivery and marketing', category: 'marketing', authType: 'API Key', n8nNodeName: 'n8n-nodes-base.sendGrid', setupSteps: ['Go to SendGrid Settings > API Keys', 'Create a new API key with required permissions', 'In n8n, create SendGrid credential with the key'], exampleUse: 'Send transactional emails, manage contacts, templates' },
  { name: 'ActiveCampaign', description: 'Marketing automation and CRM', category: 'marketing', authType: 'API Key + URL', n8nNodeName: 'n8n-nodes-base.activeCampaign', setupSteps: ['Go to ActiveCampaign Settings > Developer', 'Copy API URL and API Key', 'In n8n, create ActiveCampaign credential with URL and Key'], exampleUse: 'Manage contacts, automations, deals, tags' },
  { name: 'GitHub', description: 'Code hosting and collaboration', category: 'dev', authType: 'PAT / OAuth2', n8nNodeName: 'n8n-nodes-base.github', setupSteps: ['Go to GitHub Settings > Developer Settings > Personal Access Tokens', 'Create a fine-grained or classic token', 'Select required repository permissions', 'In n8n, create GitHub credential with the token'], exampleUse: 'Create issues, manage PRs, trigger on events' },
  { name: 'GitLab', description: 'DevOps platform with CI/CD', category: 'dev', authType: 'PAT', n8nNodeName: 'n8n-nodes-base.gitlab', setupSteps: ['Go to GitLab User Settings > Access Tokens', 'Create a Personal Access Token with api scope', 'In n8n, create GitLab credential with the token'], exampleUse: 'Manage issues, merge requests, pipelines' },
  { name: 'Webhook', description: 'Receive HTTP requests to trigger workflows', category: 'dev', authType: 'None (built-in)', n8nNodeName: 'n8n-nodes-base.webhook', setupSteps: ['Add a Webhook node to your workflow', 'Configure HTTP method (GET/POST)', 'Activate the workflow to get the webhook URL', 'Send requests to the generated URL'], exampleUse: 'Receive form submissions, API callbacks, event notifications' },
  { name: 'HTTP Request', description: 'Make API calls to any service', category: 'dev', authType: 'Various (Header, OAuth2, etc.)', n8nNodeName: 'n8n-nodes-base.httpRequest', setupSteps: ['Add HTTP Request node', 'Set URL, method, headers, and body', 'Configure authentication if needed', 'Use expressions to inject dynamic data'], exampleUse: 'Call any REST API, scrape web data, integrate custom services' },
  { name: 'OpenAI', description: 'GPT models for text generation and analysis', category: 'ai', authType: 'API Key', n8nNodeName: '@n8n/n8n-nodes-langchain.openAi', setupSteps: ['Go to platform.openai.com/api-keys', 'Create a new API key', 'Ensure billing is set up', 'In n8n, create OpenAI credential with the key'], exampleUse: 'Generate text, classify content, extract data, chat' },
  { name: 'Anthropic', description: 'Claude AI models for advanced reasoning', category: 'ai', authType: 'API Key', n8nNodeName: '@n8n/n8n-nodes-langchain.anthropic', setupSteps: ['Go to console.anthropic.com', 'Create an API key', 'In n8n, create Anthropic credential with the key'], exampleUse: 'Complex reasoning, document analysis, code generation' },
  { name: 'Google AI (Gemini)', description: 'Google Gemini models', category: 'ai', authType: 'API Key', n8nNodeName: '@n8n/n8n-nodes-langchain.googleGemini', setupSteps: ['Go to makersuite.google.com/app/apikey', 'Create an API key', 'In n8n, create Google Gemini credential with the key'], exampleUse: 'Multimodal AI, text generation, vision tasks' }
];

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

app.listen(PORT, () => console.log(`Workflow Engineer dashboard on port ${PORT}`));
