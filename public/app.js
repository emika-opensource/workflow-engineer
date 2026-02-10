/* === Workflow Engineer SPA === */
(function() {
'use strict';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const content = () => $('#content');

// --- State ---
let state = {
  n8nOnline: false,
  workflows: [],
  templates: [],
  connectors: [],
  executions: [],
  analytics: null,
  activeFilter: 'all',
  searchQuery: ''
};

// --- API ---
async function api(path, opts = {}) {
  try {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    return await res.json();
  } catch (e) {
    console.error('API error:', e);
    return { error: e.message };
  }
}

// --- Toast ---
function toast(msg, type = 'success') {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

// --- SVG Icons ---
const icons = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 12H5m7-7-7 7 7 7"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5,3 19,12 5,21"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
  deploy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 3v12m0 0-4-4m4 4 4-4M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>'
};

// --- Status Check ---
async function checkN8nStatus() {
  const s = await api('/status');
  state.n8nOnline = s.n8n === 'running';
  const dot = $('.status-dot');
  const txt = $('.status-text');
  if (dot) { dot.className = `status-dot ${state.n8nOnline ? 'online' : 'offline'}`; }
  if (txt) { txt.textContent = `n8n: ${state.n8nOnline ? 'running' : 'offline'}`; }
}

// --- Router ---
function getPage() { return (location.hash || '#dashboard').slice(1).split('/'); }

function navigate() {
  const [page, ...params] = getPage();
  $$('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  const routes = { dashboard: renderDashboard, workflows: renderWorkflows, templates: renderTemplates, connectors: renderConnectors, executions: renderExecutions, n8n: renderN8n, settings: renderSettings };
  const render = routes[page];
  if (render) render(params);
  else renderDashboard();
}

// ==================== DASHBOARD ====================
async function renderDashboard() {
  content().innerHTML = `
    <div class="page-header"><h1>Dashboard</h1><p>Overview of your automation workflows</p></div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Active Workflows</div><div class="stat-value accent" id="statActive">--</div></div>
      <div class="stat-card"><div class="stat-label">Total Executions</div><div class="stat-value" id="statExec">--</div></div>
      <div class="stat-card"><div class="stat-label">Success Rate</div><div class="stat-value green" id="statRate">--</div></div>
      <div class="stat-card"><div class="stat-label">n8n Status</div><div class="stat-value" id="statN8n"><span class="badge ${state.n8nOnline ? 'badge-success' : 'badge-error'}">${state.n8nOnline ? 'Online' : 'Offline'}</span></div></div>
    </div>
    <div class="quick-actions">
      <button class="btn btn-primary" onclick="location.hash='#n8n'">${icons.plus} Create Workflow</button>
      <button class="btn btn-secondary" onclick="location.hash='#templates'">${icons.search} Browse Templates</button>
      <a class="btn btn-secondary" href="http://localhost:5678" target="_blank">${icons.external} Open n8n</a>
    </div>
    <div class="card">
      <div class="card-header"><h3>Recent Executions</h3><button class="btn btn-sm btn-secondary" onclick="renderDashboard()">${icons.refresh} Refresh</button></div>
      <div class="table-wrap" id="recentExecTable"><div class="loading"><div class="spinner"></div></div></div>
    </div>`;
  
  if (!state.n8nOnline) return;
  try {
    const a = await api('/analytics');
    if (!a.error) {
      state.analytics = a;
      const sa = $('#statActive'); if (sa) sa.textContent = a.activeWorkflows;
      const se = $('#statExec'); if (se) se.textContent = a.totalExecutions;
      const sr = $('#statRate'); if (sr) sr.textContent = a.successRate + '%';
      const re = a.recentExecutions || [];
      $('#recentExecTable').innerHTML = re.length ? `<table><thead><tr><th>Workflow</th><th>Status</th><th>Started</th><th>Duration</th></tr></thead><tbody>${re.map(e => {
        const finished = e.finished && !e.stoppedAt;
        const dur = e.startedAt && e.stoppedAt ? Math.round((new Date(e.stoppedAt) - new Date(e.startedAt)) / 1000) + 's' : '--';
        return `<tr onclick="location.hash='#executions/${e.id}'"><td>${e.workflowData?.name || 'Unknown'}</td><td><span class="badge ${finished ? 'badge-success' : 'badge-error'}">${finished ? 'Success' : 'Error'}</span></td><td>${timeAgo(e.startedAt)}</td><td>${dur}</td></tr>`;
      }).join('')}</tbody></table>` : '<div class="empty-state"><h3>No executions yet</h3><p>Create and run a workflow to see execution data here</p></div>';
    }
  } catch {}
}

// ==================== WORKFLOWS ====================
async function renderWorkflows(params) {
  if (params && params[0]) return renderWorkflowDetail(params[0]);
  content().innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
      <div><h1>Workflows</h1><p>Manage your n8n workflows</p></div>
      <a class="btn btn-primary" href="http://localhost:5678/workflow/new" target="_blank">${icons.plus} New in n8n</a>
    </div>
    <div id="workflowList"><div class="loading"><div class="spinner"></div></div></div>`;
  
  if (!state.n8nOnline) { $('#workflowList').innerHTML = offlineMsg(); return; }
  try {
    const r = await api('/workflows');
    const wfs = r.data || [];
    state.workflows = wfs;
    if (!wfs.length) {
      $('#workflowList').innerHTML = '<div class="empty-state"><h3>No workflows yet</h3><p>Create one in n8n or deploy a template</p><button class="btn btn-primary" onclick="location.hash=\'#templates\'">' + icons.deploy + ' Browse Templates</button></div>';
      return;
    }
    $('#workflowList').innerHTML = `<div class="workflow-list">${wfs.map(w => `
      <div class="workflow-item" onclick="location.hash='#workflows/${w.id}'">
        <div class="wf-name">${esc(w.name)}</div>
        <div class="wf-meta">
          <span class="badge ${w.active ? 'badge-success' : 'badge-muted'}">${w.active ? 'Active' : 'Inactive'}</span>
          <span>${timeAgo(w.updatedAt)}</span>
        </div>
        <label class="toggle" onclick="event.stopPropagation()">
          <input type="checkbox" ${w.active ? 'checked' : ''} onchange="toggleWorkflow('${w.id}', this.checked)">
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
      </div>`).join('')}</div>`;
  } catch { $('#workflowList').innerHTML = offlineMsg(); }
}

async function renderWorkflowDetail(id) {
  content().innerHTML = `<div class="detail-panel">
    <div class="back-link" onclick="location.hash='#workflows'">${icons.back} Back to Workflows</div>
    <div class="loading"><div class="spinner"></div></div></div>`;
  try {
    const w = await api(`/workflows/${id}`);
    if (w.error) { content().innerHTML = `<p>Error: ${w.error}</p>`; return; }
    const nodes = w.nodes || [];
    content().querySelector('.detail-panel').innerHTML = `
      <div class="back-link" onclick="location.hash='#workflows'">${icons.back} Back to Workflows</div>
      <h2>${esc(w.name)}</h2>
      <div style="display:flex;gap:10px;margin-bottom:20px;align-items:center">
        <span class="badge ${w.active ? 'badge-success' : 'badge-muted'}">${w.active ? 'Active' : 'Inactive'}</span>
        <span style="color:var(--text-muted);font-size:12px">Updated ${timeAgo(w.updatedAt)}</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:24px">
        <button class="btn btn-primary" onclick="executeWorkflow('${w.id}')">${icons.play} Execute</button>
        <a class="btn btn-secondary" href="http://localhost:5678/workflow/${w.id}" target="_blank">${icons.external} Edit in n8n</a>
        <button class="btn btn-secondary" onclick="toggleWorkflow('${w.id}', ${!w.active}).then(()=>renderWorkflowDetail('${w.id}'))">${w.active ? 'Deactivate' : 'Activate'}</button>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><h3>Nodes (${nodes.length})</h3></div>
        <div class="node-diagram">${nodes.map((n, i) => `<div class="node-box ${i === 0 ? 'trigger' : 'action'}">${esc(n.name)}</div>${i < nodes.length - 1 ? `<div class="node-arrow">${icons.arrow}</div>` : ''}`).join('')}</div>
      </div>`;
  } catch (e) { content().innerHTML = `<p>Error loading workflow</p>`; }
}

window.toggleWorkflow = async function(id, active) {
  const endpoint = active ? 'activate' : 'deactivate';
  const r = await api(`/workflows/${id}/${endpoint}`, { method: 'POST' });
  if (!r.error) toast(`Workflow ${active ? 'activated' : 'deactivated'}`);
  else toast(r.error, 'error');
};

window.executeWorkflow = async function(id) {
  toast('Executing workflow...');
  const r = await api(`/workflows/${id}/execute`, { method: 'POST', body: {} });
  if (!r.error) toast('Workflow executed successfully');
  else toast('Execution failed: ' + r.error, 'error');
};

// ==================== TEMPLATES ====================
async function renderTemplates(params) {
  if (params && params[0]) return renderTemplateDetail(params[0]);
  const cats = ['all', 'communication', 'crm', 'data', 'marketing', 'dev', 'ai'];
  content().innerHTML = `
    <div class="page-header"><h1>Templates</h1><p>Pre-built workflow templates ready to deploy</p></div>
    <div class="filter-tabs">${cats.map(c => `<button class="filter-tab ${state.activeFilter === c ? 'active' : ''}" onclick="filterTemplates('${c}')">${c === 'all' ? 'All' : cap(c)}</button>`).join('')}</div>
    <div id="templateGrid"><div class="loading"><div class="spinner"></div></div></div>`;
  loadTemplates();
}

async function loadTemplates() {
  const r = await api(`/templates?category=${state.activeFilter}`);
  state.templates = Array.isArray(r) ? r : [];
  const grid = $('#templateGrid');
  if (!grid) return;
  if (!state.templates.length) { grid.innerHTML = '<div class="empty-state"><h3>No templates in this category</h3></div>'; return; }
  grid.innerHTML = `<div class="template-grid">${state.templates.map(t => `
    <div class="template-card" onclick="location.hash='#templates/${t.id}'">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px">
        <h4>${esc(t.name)}</h4>
        <span class="badge ${t.complexity === 'beginner' ? 'badge-success' : t.complexity === 'intermediate' ? 'badge-warning' : 'badge-purple'}">${cap(t.complexity)}</span>
      </div>
      <p>${esc(t.description)}</p>
      <div class="template-flow">${(t.triggers || []).map(tr => `<span class="flow-node">${esc(tr)}</span>`).join('')}<span class="flow-arrow">${icons.arrow}</span>${(t.actions || []).map(a => `<span class="flow-node">${esc(a)}</span>`).join('')}</div>
    </div>`).join('')}</div>`;
}

window.filterTemplates = function(cat) {
  state.activeFilter = cat;
  $$('.filter-tab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase() === cat || (cat === 'all' && t.textContent === 'All')));
  loadTemplates();
};

async function renderTemplateDetail(id) {
  content().innerHTML = `<div class="detail-panel"><div class="back-link" onclick="location.hash='#templates'">${icons.back} Back to Templates</div><div class="loading"><div class="spinner"></div></div></div>`;
  const t = await api(`/templates/${id}`);
  if (t.error) { content().innerHTML = `<p>Error: ${t.error}</p>`; return; }
  const nodes = t.n8nJson?.nodes || [];
  content().querySelector('.detail-panel').innerHTML = `
    <div class="back-link" onclick="location.hash='#templates'">${icons.back} Back to Templates</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <h2>${esc(t.name)}</h2>
      <span class="badge ${t.complexity === 'beginner' ? 'badge-success' : t.complexity === 'intermediate' ? 'badge-warning' : 'badge-purple'}">${cap(t.complexity)}</span>
    </div>
    <p class="detail-desc">${esc(t.description)}</p>
    <div style="display:flex;gap:10px;margin-bottom:24px">
      <button class="btn btn-primary" onclick="deployTemplate('${t.id}')">${icons.deploy} Deploy to n8n</button>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3>Workflow Nodes</h3></div>
      <div class="node-diagram">${nodes.map((n, i) => `<div class="node-box ${i === 0 ? 'trigger' : 'action'}">${esc(n.name)}</div>${i < nodes.length - 1 ? `<div class="node-arrow">${icons.arrow}</div>` : ''}`).join('')}</div>
    </div>
    <div class="card">
      <div class="card-header"><h3>Details</h3></div>
      <div style="font-size:13px;color:var(--text-muted)">
        <p><strong>Category:</strong> ${cap(t.category)}</p>
        <p style="margin-top:6px"><strong>Triggers:</strong> ${(t.triggers || []).join(', ')}</p>
        <p style="margin-top:6px"><strong>Actions:</strong> ${(t.actions || []).join(', ')}</p>
      </div>
    </div>`;
}

window.deployTemplate = async function(id) {
  if (!state.n8nOnline) { toast('n8n is offline — cannot deploy', 'error'); return; }
  toast('Deploying template to n8n...');
  const r = await api(`/templates/${id}/deploy`, { method: 'POST' });
  if (r.ok) { toast('Template deployed successfully!'); location.hash = '#workflows'; }
  else toast('Deploy failed: ' + (r.error || 'Unknown error'), 'error');
};

// ==================== CONNECTORS ====================
async function renderConnectors(params) {
  if (params && params[0]) return renderConnectorDetail(params[0]);
  const cats = ['all', 'communication', 'crm', 'project', 'data', 'cloud', 'marketing', 'dev', 'ai'];
  content().innerHTML = `
    <div class="page-header"><h1>Connectors</h1><p>Integration guides for n8n nodes</p></div>
    <div class="search-bar">${icons.search}<input type="text" placeholder="Search connectors..." oninput="searchConnectors(this.value)"></div>
    <div class="filter-tabs">${cats.map(c => `<button class="filter-tab ${c === 'all' ? 'active' : ''}" onclick="filterConnectors('${c}')">${c === 'all' ? 'All' : cap(c)}</button>`).join('')}</div>
    <div id="connectorGrid"><div class="loading"><div class="spinner"></div></div></div>`;
  loadConnectors('all', '');
}

async function loadConnectors(cat, search) {
  const qs = new URLSearchParams();
  if (cat !== 'all') qs.set('category', cat);
  if (search) qs.set('search', search);
  const r = await api(`/connectors?${qs}`);
  state.connectors = Array.isArray(r) ? r : [];
  const grid = $('#connectorGrid');
  if (!grid) return;
  if (!state.connectors.length) { grid.innerHTML = '<div class="empty-state"><h3>No connectors found</h3></div>'; return; }
  // Group by category
  const groups = {};
  state.connectors.forEach(c => { (groups[c.category] = groups[c.category] || []).push(c); });
  grid.innerHTML = Object.entries(groups).map(([cat, items]) => `
    <h3 style="margin:20px 0 12px;font-size:13px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">${cap(cat)}</h3>
    <div class="connector-grid">${items.map(c => `
      <div class="connector-card" onclick="location.hash='#connectors/${encodeURIComponent(c.name.toLowerCase().replace(/[^a-z0-9]/g,''))}'">
        <h4>${esc(c.name)}</h4>
        <p>${esc(c.description)}</p>
        <div class="connector-meta"><span class="badge badge-muted">${esc(c.authType)}</span></div>
      </div>`).join('')}</div>`).join('');
}

window.filterConnectors = function(cat) {
  $$('.filter-tab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase() === cat || (cat === 'all' && t.textContent === 'All')));
  const search = $('.search-bar input')?.value || '';
  loadConnectors(cat, search);
};

window.searchConnectors = function(q) {
  const activeCat = $('.filter-tab.active')?.textContent.toLowerCase() || 'all';
  loadConnectors(activeCat === 'all' ? 'all' : activeCat, q);
};

async function renderConnectorDetail(slug) {
  content().innerHTML = `<div class="detail-panel"><div class="back-link" onclick="location.hash='#connectors'">${icons.back} Back to Connectors</div><div class="loading"><div class="spinner"></div></div></div>`;
  const c = await api(`/connectors/${slug}`);
  if (c.error) { content().innerHTML = `<p>Connector not found</p>`; return; }
  content().querySelector('.detail-panel').innerHTML = `
    <div class="back-link" onclick="location.hash='#connectors'">${icons.back} Back to Connectors</div>
    <h2>${esc(c.name)}</h2>
    <p class="detail-desc">${esc(c.description)}</p>
    <div style="display:flex;gap:8px;margin-bottom:24px">
      <span class="badge badge-purple">${esc(c.category)}</span>
      <span class="badge badge-muted">${esc(c.authType)}</span>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3>n8n Node</h3></div>
      <code style="font-size:13px;color:var(--accent-light)">${esc(c.n8nNodeName)}</code>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3>Setup Guide</h3></div>
      <ol class="setup-steps">${(c.setupSteps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    </div>
    <div class="card">
      <div class="card-header"><h3>Example Use</h3></div>
      <p style="font-size:13px;color:var(--text-muted)">${esc(c.exampleUse)}</p>
    </div>`;
}

// ==================== EXECUTIONS ====================
async function renderExecutions(params) {
  if (params && params[0]) return renderExecutionDetail(params[0]);
  content().innerHTML = `
    <div class="page-header"><h1>Executions</h1><p>Workflow execution history</p></div>
    <div class="exec-filters">
      <select class="form-input" style="width:auto" onchange="filterExecStatus(this.value)">
        <option value="">All Statuses</option><option value="success">Success</option><option value="error">Error</option>
      </select>
      <button class="btn btn-sm btn-secondary" onclick="renderExecutions()">${icons.refresh} Refresh</button>
    </div>
    <div class="card"><div class="table-wrap" id="execTable"><div class="loading"><div class="spinner"></div></div></div></div>`;
  
  if (!state.n8nOnline) { $('#execTable').innerHTML = offlineMsg(); return; }
  try {
    const r = await api('/executions?limit=50');
    const execs = r.data || [];
    state.executions = execs;
    renderExecTable(execs);
  } catch { $('#execTable').innerHTML = offlineMsg(); }
}

function renderExecTable(execs) {
  const el = $('#execTable');
  if (!el) return;
  if (!execs.length) { el.innerHTML = '<div class="empty-state"><h3>No executions yet</h3></div>'; return; }
  el.innerHTML = `<table><thead><tr><th>ID</th><th>Workflow</th><th>Status</th><th>Started</th><th>Duration</th></tr></thead><tbody>${execs.map(e => {
    const ok = e.finished && !e.stoppedAt;
    const dur = e.startedAt && e.stoppedAt ? Math.round((new Date(e.stoppedAt) - new Date(e.startedAt)) / 1000) + 's' : '--';
    return `<tr onclick="location.hash='#executions/${e.id}'"><td style="color:var(--text-muted)">#${e.id}</td><td>${e.workflowData?.name || 'Unknown'}</td><td><span class="badge ${ok ? 'badge-success' : 'badge-error'}">${ok ? 'Success' : 'Error'}</span></td><td>${timeAgo(e.startedAt)}</td><td>${dur}</td></tr>`;
  }).join('')}</tbody></table>`;
}

window.filterExecStatus = function(status) {
  if (!status) { renderExecTable(state.executions); return; }
  const filtered = state.executions.filter(e => {
    const ok = e.finished && !e.stoppedAt;
    return status === 'success' ? ok : !ok;
  });
  renderExecTable(filtered);
};

async function renderExecutionDetail(id) {
  content().innerHTML = `<div class="detail-panel"><div class="back-link" onclick="location.hash='#executions'">${icons.back} Back to Executions</div><div class="loading"><div class="spinner"></div></div></div>`;
  try {
    const e = await api(`/executions/${id}`);
    if (e.error) { content().innerHTML = `<p>Error: ${e.error}</p>`; return; }
    const ok = e.finished && !e.stoppedAt;
    content().querySelector('.detail-panel').innerHTML = `
      <div class="back-link" onclick="location.hash='#executions'">${icons.back} Back to Executions</div>
      <h2>Execution #${e.id}</h2>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:20px">
        <span class="badge ${ok ? 'badge-success' : 'badge-error'}">${ok ? 'Success' : 'Error'}</span>
        <span style="color:var(--text-muted);font-size:13px">${e.workflowData?.name || 'Unknown'}</span>
      </div>
      <div class="two-col">
        <div class="card"><div class="card-header"><h3>Started</h3></div><p style="font-size:13px;color:var(--text-muted)">${e.startedAt ? new Date(e.startedAt).toLocaleString() : '--'}</p></div>
        <div class="card"><div class="card-header"><h3>Finished</h3></div><p style="font-size:13px;color:var(--text-muted)">${e.stoppedAt ? new Date(e.stoppedAt).toLocaleString() : '--'}</p></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header"><h3>Data</h3></div>
        <pre style="font-size:12px;color:var(--text-muted);overflow-x:auto;max-height:400px;white-space:pre-wrap">${esc(JSON.stringify(e.data || {}, null, 2).slice(0, 5000))}</pre>
      </div>`;
  } catch { content().innerHTML = '<p>Error loading execution</p>'; }
}

// ==================== N8N EMBED ====================
function renderN8n() {
  content().innerHTML = `
    <div class="page-header"><h1>n8n Editor</h1><p>Visual workflow builder</p></div>
    <div class="n8n-actions">
      <a class="btn btn-primary" href="http://localhost:5678" target="_blank">${icons.external} Open in New Tab</a>
      <a class="btn btn-secondary" href="http://localhost:5678/workflow/new" target="_blank">${icons.plus} New Workflow</a>
      <span style="font-size:12px;color:var(--text-muted)">Tip: n8n works best in its own tab</span>
    </div>
    ${state.n8nOnline ? '<iframe class="n8n-embed" src="http://localhost:5678" title="n8n Editor"></iframe>' : '<div class="card"><div class="empty-state"><h3>n8n is offline</h3><p>The n8n service is starting up or unavailable. It usually takes 15-30 seconds after container start.</p></div></div>'}`;
}

// ==================== SETTINGS ====================
async function renderSettings() {
  const cfg = await api('/config');
  content().innerHTML = `
    <div class="page-header"><h1>Settings</h1><p>Configure your workflow environment</p></div>
    <div class="config-section">
      <div class="card">
        <div class="card-header"><h3>n8n API Key</h3></div>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Required to manage workflows via API. Find it in n8n Settings > API.</p>
        <div class="form-group">
          <label>API Key</label>
          <div style="display:flex;gap:8px">
            <input type="password" class="form-input" id="apiKeyInput" placeholder="Enter n8n API key..." value="${cfg.n8nApiKey || ''}">
            <button class="btn btn-primary" onclick="saveApiKey()">Save</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>n8n Status</h3></div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="status-dot ${state.n8nOnline ? 'online' : 'offline'}"></span>
          <span style="font-size:13px">${state.n8nOnline ? 'n8n is running on port 5678' : 'n8n is offline'}</span>
        </div>
        <div style="margin-top:12px">
          <a class="btn btn-sm btn-secondary" href="http://localhost:5678/settings" target="_blank">${icons.external} n8n Settings</a>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>About</h3></div>
        <p style="font-size:13px;color:var(--text-muted)">Workflow Engineer is an Emika AI Employee that bundles n8n for visual workflow automation. The AI assistant can create, manage, and execute workflows via the n8n REST API.</p>
      </div>
    </div>`;
}

window.saveApiKey = async function() {
  const key = $('#apiKeyInput')?.value;
  if (!key) { toast('Please enter an API key', 'error'); return; }
  await api('/config', { method: 'PUT', body: { n8nApiKey: key } });
  toast('API key saved');
};

// ==================== HELPERS ====================
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function timeAgo(d) {
  if (!d) return '--';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function offlineMsg() { return '<div class="empty-state"><h3>n8n is offline</h3><p>Cannot connect to n8n. It may still be starting up (15-30s after container start).</p></div>'; }

// --- Init ---
window.addEventListener('hashchange', navigate);
checkN8nStatus();
setInterval(checkN8nStatus, 15000);
navigate();

})();
