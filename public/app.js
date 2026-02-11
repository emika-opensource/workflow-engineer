/* === Workflow Engineer SPA === */
(function() {
'use strict';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const content = () => $('#content');

// --- State ---
let state = {
  n8nOnline: false,
  configured: false,
  firstRun: true,
  workflows: [],
  templates: [],
  connectors: [],
  executions: [],
  analytics: null,
  templateFilter: 'all',
  connectorFilter: 'all',
  searchQuery: '',
  loading: {}
};

// --- API ---
async function api(path, opts = {}) {
  try {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json();
    if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
    return data;
  } catch (e) {
    console.error('API error:', e);
    return { error: e.message || 'Network error' };
  }
}

// --- Toast ---
function toast(msg, type = 'success') {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3500);
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
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>'
};

// --- Button helpers ---
function setButtonLoading(btn, loading, text) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner spinner-sm"></span> ${text || 'Loading...'}`;
  } else {
    btn.innerHTML = btn.dataset.origText || text || '';
  }
}

// --- Status Check ---
async function checkN8nStatus() {
  const s = await api('/status');
  state.n8nOnline = s.n8n === 'running';
  state.configured = !!s.configured;
  state.firstRun = !!s.firstRun;
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

// ==================== ONBOARDING WIZARD ====================
function renderOnboarding() {
  return `
    <div class="onboarding-overlay">
      <div class="onboarding-wizard">
        <div class="onboarding-header">
          ${icons.rocket}
          <h2>Welcome to Workflow Engineer</h2>
          <p>Let's get you automating in under a minute</p>
        </div>
        <div class="onboarding-steps" id="onboardingSteps">
          <div class="onboarding-step active" data-step="1">
            <div class="step-indicator">
              <span class="step-dot active">1</span>
              <span class="step-line"></span>
              <span class="step-dot">2</span>
              <span class="step-line"></span>
              <span class="step-dot">3</span>
            </div>
            <h3>n8n is starting up...</h3>
            <p>The workflow engine is booting. This takes about 15-30 seconds.</p>
            <div class="onboarding-status" id="onboardingN8nStatus">
              <span class="status-dot loading"></span>
              <span>Waiting for n8n...</span>
            </div>
            <button class="btn btn-primary" id="onboardingNext1" disabled onclick="onboardingStep2()">Continue</button>
          </div>
          <div class="onboarding-step" data-step="2" style="display:none">
            <div class="step-indicator">
              <span class="step-dot done">${icons.check}</span>
              <span class="step-line done"></span>
              <span class="step-dot active">2</span>
              <span class="step-line"></span>
              <span class="step-dot">3</span>
            </div>
            <h3>What do you want to automate?</h3>
            <p>Pick a category to see relevant templates:</p>
            <div class="onboarding-categories">
              <button class="onboarding-cat" onclick="onboardingPickCategory('communication')">💬 Communication<span>Slack, Email, Discord</span></button>
              <button class="onboarding-cat" onclick="onboardingPickCategory('crm')">📇 CRM & Sales<span>HubSpot, Salesforce, Leads</span></button>
              <button class="onboarding-cat" onclick="onboardingPickCategory('data')">📊 Data & Sync<span>Sheets, Databases, APIs</span></button>
              <button class="onboarding-cat" onclick="onboardingPickCategory('marketing')">📣 Marketing<span>Social, Email campaigns</span></button>
              <button class="onboarding-cat" onclick="onboardingPickCategory('dev')">🛠️ Dev & Ops<span>GitHub, Webhooks, Alerts</span></button>
              <button class="onboarding-cat" onclick="onboardingPickCategory('all')">🔄 Show me everything<span>All templates</span></button>
            </div>
          </div>
          <div class="onboarding-step" data-step="3" style="display:none">
            <div class="step-indicator">
              <span class="step-dot done">${icons.check}</span>
              <span class="step-line done"></span>
              <span class="step-dot done">${icons.check}</span>
              <span class="step-line done"></span>
              <span class="step-dot active">3</span>
            </div>
            <h3>Deploy your first workflow</h3>
            <p>Pick a template to deploy instantly:</p>
            <div class="onboarding-templates" id="onboardingTemplates">
              <div class="loading"><div class="spinner"></div></div>
            </div>
            <div style="margin-top:16px;text-align:center">
              <button class="btn btn-secondary" onclick="skipOnboarding()">Skip — I'll explore on my own</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

// Poll n8n status during onboarding
let onboardingPoll = null;
function startOnboardingPoll() {
  onboardingPoll = setInterval(async () => {
    const s = await api('/status');
    state.n8nOnline = s.n8n === 'running';
    const statusEl = $('#onboardingN8nStatus');
    const btn = $('#onboardingNext1');
    if (state.n8nOnline && statusEl) {
      statusEl.innerHTML = '<span class="status-dot online"></span><span>n8n is ready!</span>';
      if (btn) btn.disabled = false;
      clearInterval(onboardingPoll);
    }
  }, 3000);
}

window.onboardingStep2 = function() {
  $$('.onboarding-step').forEach(s => s.style.display = 'none');
  const step2 = $('[data-step="2"]');
  if (step2) { step2.style.display = 'block'; step2.classList.add('active'); }
};

window.onboardingPickCategory = async function(cat) {
  $$('.onboarding-step').forEach(s => s.style.display = 'none');
  const step3 = $('[data-step="3"]');
  if (step3) { step3.style.display = 'block'; step3.classList.add('active'); }

  const r = await api(`/templates?category=${cat}`);
  const templates = Array.isArray(r) ? r : [];
  const grid = $('#onboardingTemplates');
  if (!grid) return;

  if (!templates.length) {
    grid.innerHTML = '<p style="color:var(--text-muted)">No templates in this category. Try "Show me everything".</p>';
    return;
  }

  grid.innerHTML = templates.map(t => `
    <div class="onboarding-tpl-card">
      <div>
        <h4>${esc(t.name)}</h4>
        <p>${esc(t.description)}</p>
        <span class="badge ${t.complexity === 'beginner' ? 'badge-success' : t.complexity === 'intermediate' ? 'badge-warning' : 'badge-purple'}">${cap(t.complexity)}</span>
      </div>
      <button class="btn btn-primary btn-sm" id="onb-deploy-${t.id}" onclick="onboardingDeploy('${t.id}', this)">${icons.deploy} Deploy</button>
    </div>`).join('');
};

window.onboardingDeploy = async function(id, btn) {
  setButtonLoading(btn, true, 'Deploying...');
  const r = await api(`/templates/${id}/deploy`, { method: 'POST' });
  if (r.ok) {
    await api('/config', { method: 'PUT', body: { setupComplete: true } });
    state.firstRun = false;
    toast('🎉 Workflow deployed! Welcome aboard!');
    // Show post-deploy guidance
    showPostDeployModal(r);
  } else {
    setButtonLoading(btn, false, `${icons.deploy} Deploy`);
    toast('Deploy failed: ' + (r.error || 'Unknown error'), 'error');
  }
};

window.skipOnboarding = async function() {
  await api('/config', { method: 'PUT', body: { setupComplete: true } });
  state.firstRun = false;
  if (onboardingPoll) clearInterval(onboardingPoll);
  navigate();
};

// ==================== POST-DEPLOY MODAL ====================
function showPostDeployModal(deployResult) {
  if (onboardingPoll) clearInterval(onboardingPoll);
  const wf = deployResult.workflow;
  const webhook = deployResult.webhookUrl;
  const creds = deployResult.credentialsNeeded || [];

  let html = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-content">
        <h2>✅ Workflow Deployed!</h2>
        <p style="margin-bottom:20px;color:var(--text-muted)"><strong>${esc(wf?.name || 'Workflow')}</strong> is ready. Here's what to do next:</p>
        <div class="deploy-checklist">
          <div class="checklist-item done"><span class="checklist-icon">${icons.check}</span> Template deployed to n8n</div>`;

  if (creds.length) {
    html += `<div class="checklist-item pending"><span class="checklist-icon">⬜</span> Configure credentials:
      <ul style="margin:8px 0 0 24px;font-size:12px;color:var(--text-muted)">
        ${creds.map(c => `<li><strong>${esc(c.node)}</strong> needs ${esc(c.connector)} (${esc(c.authType)}) — <a href="http://localhost:5678/credentials/new" target="_blank">set up in n8n</a></li>`).join('')}
      </ul>
    </div>`;
  }

  if (webhook) {
    html += `<div class="checklist-item pending"><span class="checklist-icon">⬜</span> Webhook URLs:
      <div style="margin:8px 0;font-size:12px">
        <div style="margin-bottom:6px"><strong>Test:</strong> <code class="webhook-url">${esc(webhook.test)}</code></div>
        <div><strong>Production:</strong> <code class="webhook-url">${esc(webhook.production)}</code></div>
      </div>
    </div>`;
  }

  html += `
          <div class="checklist-item pending"><span class="checklist-icon">⬜</span> Test the workflow with a manual execution</div>
          <div class="checklist-item pending"><span class="checklist-icon">⬜</span> Activate the workflow when ready</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:24px">
          <a class="btn btn-primary" href="http://localhost:5678/workflow/${wf?.id || ''}" target="_blank">${icons.external} Open in n8n</a>
          <button class="btn btn-secondary" onclick="closeModal();location.hash='#workflows'">Go to Workflows</button>
          <button class="btn btn-secondary" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>`;

  // Remove existing modal
  const existing = $('.modal-overlay');
  if (existing) existing.remove();

  document.body.insertAdjacentHTML('beforeend', html);
}

window.closeModal = function() {
  const m = $('.modal-overlay');
  if (m) m.remove();
};

// ==================== DASHBOARD ====================
async function renderDashboard() {
  // Show onboarding wizard for first-run users
  if (state.firstRun && !state.configured) {
    content().innerHTML = renderOnboarding();
    startOnboardingPoll();
    // If n8n is already online, enable the button immediately
    if (state.n8nOnline) {
      const statusEl = $('#onboardingN8nStatus');
      const btn = $('#onboardingNext1');
      if (statusEl) statusEl.innerHTML = '<span class="status-dot online"></span><span>n8n is ready!</span>';
      if (btn) btn.disabled = false;
      clearInterval(onboardingPoll);
    }
    return;
  }

  const hasData = state.n8nOnline && state.configured;
  content().innerHTML = `
    <div class="page-header"><h1>Dashboard</h1><p>Overview of your automation workflows</p></div>
    ${!state.configured ? `<div class="card" style="margin-bottom:20px;border-color:var(--yellow)">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">⚠️</span>
        <div><strong>API key not configured</strong><p style="font-size:12px;color:var(--text-muted)">Go to <a href="#settings">Settings</a> to enter your n8n API key, or it may auto-configure shortly.</p></div>
      </div>
    </div>` : ''}
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Active Workflows</div><div class="stat-value accent" id="statActive">--</div></div>
      <div class="stat-card"><div class="stat-label">Total Executions</div><div class="stat-value" id="statExec">--</div></div>
      <div class="stat-card"><div class="stat-label">Success Rate</div><div class="stat-value green" id="statRate">--</div></div>
      <div class="stat-card"><div class="stat-label">n8n Status</div><div class="stat-value" id="statN8n"><span class="badge ${state.n8nOnline ? 'badge-success' : 'badge-error'}">${state.n8nOnline ? 'Online' : 'Offline'}</span></div></div>
    </div>
    <div class="quick-actions">
      <button class="btn btn-primary" onclick="location.hash='#templates'">${icons.rocket} Deploy a Template</button>
      <a class="btn btn-secondary" href="http://localhost:5678/workflow/new" target="_blank">${icons.plus} Create in n8n</a>
      <a class="btn btn-secondary" href="http://localhost:5678" target="_blank">${icons.external} Open n8n</a>
    </div>
    <div class="card">
      <div class="card-header"><h3>Recent Executions</h3><button class="btn btn-sm btn-secondary" onclick="renderDashboard()">${icons.refresh} Refresh</button></div>
      <div class="table-wrap" id="recentExecTable"><div class="loading"><div class="spinner"></div></div></div>
    </div>`;
  
  if (!state.n8nOnline) {
    $('#recentExecTable').innerHTML = '<div class="empty-state"><h3>n8n is starting up...</h3><p>The workflow engine is booting. This usually takes 15-30 seconds.</p><div class="status-dot loading" style="margin:12px auto;width:12px;height:12px"></div></div>';
    return;
  }
  try {
    const a = await api('/analytics');
    if (a.error) {
      $('#recentExecTable').innerHTML = `<div class="empty-state"><h3>Cannot load data</h3><p>${esc(a.error)}</p></div>`;
      return;
    }
    state.analytics = a;
    const sa = $('#statActive'); if (sa) sa.textContent = a.activeWorkflows;
    const se = $('#statExec'); if (se) se.textContent = a.totalExecutions;
    const sr = $('#statRate'); if (sr) sr.textContent = a.successRate + '%';
    const re = a.recentExecutions || [];
    $('#recentExecTable').innerHTML = re.length ? `<table><thead><tr><th>Workflow</th><th>Status</th><th>Started</th><th>Duration</th></tr></thead><tbody>${re.map(e => {
      const finished = e.finished === true;
      const dur = e.startedAt && e.stoppedAt ? Math.round((new Date(e.stoppedAt) - new Date(e.startedAt)) / 1000) + 's' : '--';
      return `<tr onclick="location.hash='#executions/${e.id}'"><td>${esc(e.workflowData?.name || e.workflowName || 'Unknown')}</td><td><span class="badge ${finished ? 'badge-success' : 'badge-error'}">${finished ? 'Success' : 'Error'}</span></td><td>${timeAgo(e.startedAt)}</td><td>${dur}</td></tr>`;
    }).join('')}</tbody></table>` : '<div class="empty-state"><h3>No executions yet</h3><p>Deploy a template and run it to see execution data here</p><button class="btn btn-primary" onclick="location.hash=\'#templates\'">' + icons.deploy + ' Browse Templates</button></div>';
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
    if (r.error) { $('#workflowList').innerHTML = `<div class="empty-state"><h3>Error</h3><p>${esc(r.error)}</p></div>`; return; }
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
    if (w.error) { content().innerHTML = `<div class="detail-panel"><div class="back-link" onclick="location.hash='#workflows'">${icons.back} Back</div><p>Error: ${esc(w.error)}</p></div>`; return; }
    const nodes = w.nodes || [];
    content().querySelector('.detail-panel').innerHTML = `
      <div class="back-link" onclick="location.hash='#workflows'">${icons.back} Back to Workflows</div>
      <h2>${esc(w.name)}</h2>
      <div style="display:flex;gap:10px;margin-bottom:20px;align-items:center">
        <span class="badge ${w.active ? 'badge-success' : 'badge-muted'}">${w.active ? 'Active' : 'Inactive'}</span>
        <span style="color:var(--text-muted);font-size:12px">Updated ${timeAgo(w.updatedAt)}</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap">
        <button class="btn btn-primary" id="execBtn-${w.id}" onclick="executeWorkflow('${w.id}', this)">${icons.play} Execute</button>
        <a class="btn btn-secondary" href="http://localhost:5678/workflow/${w.id}" target="_blank">${icons.external} Edit in n8n</a>
        <button class="btn btn-secondary" id="toggleBtn-${w.id}" onclick="toggleWorkflow('${w.id}', ${!w.active}).then(()=>renderWorkflowDetail('${w.id}'))">${w.active ? 'Deactivate' : 'Activate'}</button>
        <button class="btn btn-secondary" style="color:var(--red)" onclick="deleteWorkflow('${w.id}')">${icons.trash} Delete</button>
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

window.executeWorkflow = async function(id, btn) {
  if (!confirm('Execute this workflow now?')) return;
  setButtonLoading(btn, true, 'Executing...');
  const r = await api(`/workflows/${id}/execute`, { method: 'POST', body: {} });
  setButtonLoading(btn, false, `${icons.play} Execute`);
  if (!r.error) toast('Workflow executed successfully');
  else toast('Execution failed: ' + r.error, 'error');
};

window.deleteWorkflow = async function(id) {
  if (!confirm('Are you sure you want to delete this workflow? This cannot be undone.')) return;
  const r = await api(`/workflows/${id}`, { method: 'DELETE' });
  if (!r.error) { toast('Workflow deleted'); location.hash = '#workflows'; }
  else toast('Delete failed: ' + r.error, 'error');
};

// ==================== TEMPLATES ====================
async function renderTemplates(params) {
  if (params && params[0]) return renderTemplateDetail(params[0]);
  const cats = ['all', 'communication', 'crm', 'data', 'marketing', 'dev', 'ai'];
  content().innerHTML = `
    <div class="page-header"><h1>Templates</h1><p>Pre-built workflow templates ready to deploy</p></div>
    <div class="filter-tabs">${cats.map(c => `<button class="filter-tab ${state.templateFilter === c ? 'active' : ''}" onclick="filterTemplates('${c}')">${c === 'all' ? 'All' : cap(c)}</button>`).join('')}</div>
    <div id="templateGrid"><div class="loading"><div class="spinner"></div></div></div>`;
  loadTemplates();
}

async function loadTemplates() {
  const r = await api(`/templates?category=${state.templateFilter}`);
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
  state.templateFilter = cat;
  $$('.filter-tab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase() === cat || (cat === 'all' && t.textContent === 'All')));
  loadTemplates();
};

async function renderTemplateDetail(id) {
  content().innerHTML = `<div class="detail-panel"><div class="back-link" onclick="location.hash='#templates'">${icons.back} Back to Templates</div><div class="loading"><div class="spinner"></div></div></div>`;
  const t = await api(`/templates/${id}`);
  if (t.error) { content().innerHTML = `<p>Error: ${esc(t.error)}</p>`; return; }
  const nodes = t.n8nJson?.nodes || [];

  // Check for webhook node
  const webhookNode = nodes.find(n => n.type === 'n8n-nodes-base.webhook');
  let webhookInfo = '';
  if (webhookNode && webhookNode.parameters?.path) {
    webhookInfo = `
      <div class="card" style="margin-bottom:16px;border-color:var(--blue)">
        <div class="card-header"><h3>📡 Webhook URLs (after deploy)</h3></div>
        <div style="font-size:12px;color:var(--text-muted)">
          <p><strong>Test:</strong> <code class="webhook-url">http://localhost:5678/webhook-test/${esc(webhookNode.parameters.path)}</code></p>
          <p style="margin-top:6px"><strong>Production:</strong> <code class="webhook-url">http://localhost:5678/webhook/${esc(webhookNode.parameters.path)}</code></p>
        </div>
      </div>`;
  }

  content().querySelector('.detail-panel').innerHTML = `
    <div class="back-link" onclick="location.hash='#templates'">${icons.back} Back to Templates</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <h2>${esc(t.name)}</h2>
      <span class="badge ${t.complexity === 'beginner' ? 'badge-success' : t.complexity === 'intermediate' ? 'badge-warning' : 'badge-purple'}">${cap(t.complexity)}</span>
    </div>
    <p class="detail-desc">${esc(t.description)}</p>
    <div style="display:flex;gap:10px;margin-bottom:24px">
      <button class="btn btn-primary" id="deployBtn-${t.id}" onclick="deployTemplate('${t.id}', this)">${icons.deploy} Deploy to n8n</button>
    </div>
    ${webhookInfo}
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

window.deployTemplate = async function(id, btn) {
  if (!state.n8nOnline) { toast('n8n is offline — cannot deploy', 'error'); return; }
  if (!confirm('Deploy this template to n8n?')) return;
  setButtonLoading(btn, true, 'Deploying...');
  const r = await api(`/templates/${id}/deploy`, { method: 'POST' });
  setButtonLoading(btn, false, `${icons.deploy} Deploy to n8n`);
  if (r.ok) {
    toast('Template deployed successfully!');
    showPostDeployModal(r);
  } else toast('Deploy failed: ' + (r.error || 'Unknown error'), 'error');
};

// ==================== CONNECTORS ====================
async function renderConnectors(params) {
  if (params && params[0]) return renderConnectorDetail(params[0]);
  const cats = ['all', 'communication', 'crm', 'project', 'data', 'cloud', 'marketing', 'dev', 'ai'];
  content().innerHTML = `
    <div class="page-header"><h1>Connectors</h1><p>Integration guides for n8n nodes</p></div>
    <div class="search-bar">${icons.search}<input type="text" placeholder="Search connectors..." oninput="searchConnectors(this.value)"></div>
    <div class="filter-tabs">${cats.map(c => `<button class="filter-tab ${state.connectorFilter === c ? 'active' : ''}" onclick="filterConnectors('${c}')">${c === 'all' ? 'All' : cap(c)}</button>`).join('')}</div>
    <div id="connectorGrid"><div class="loading"><div class="spinner"></div></div></div>`;
  loadConnectors(state.connectorFilter, '');
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
  state.connectorFilter = cat;
  $$('.filter-tab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase() === cat || (cat === 'all' && t.textContent === 'All')));
  const search = $('.search-bar input')?.value || '';
  loadConnectors(cat, search);
};

window.searchConnectors = function(q) {
  loadConnectors(state.connectorFilter, q);
};

async function renderConnectorDetail(slug) {
  content().innerHTML = `<div class="detail-panel"><div class="back-link" onclick="location.hash='#connectors'">${icons.back} Back to Connectors</div><div class="loading"><div class="spinner"></div></div></div>`;
  const c = await api(`/connectors/${slug}`);
  if (c.error) { content().innerHTML = `<p>Connector not found</p>`; return; }
  content().querySelector('.detail-panel').innerHTML = `
    <div class="back-link" onclick="location.hash='#connectors'">${icons.back} Back to Connectors</div>
    <h2>${esc(c.name)}</h2>
    <p class="detail-desc">${esc(c.description)}</p>
    <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap">
      <span class="badge badge-purple">${esc(c.category)}</span>
      <span class="badge badge-muted">${esc(c.authType)}</span>
      <a class="btn btn-sm btn-primary" href="http://localhost:5678/credentials/new" target="_blank">${icons.plus} Set up in n8n</a>
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
    if (r.error) { $('#execTable').innerHTML = `<div class="empty-state"><h3>Error</h3><p>${esc(r.error)}</p></div>`; return; }
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
    const ok = e.finished === true;
    const dur = e.startedAt && e.stoppedAt ? Math.round((new Date(e.stoppedAt) - new Date(e.startedAt)) / 1000) + 's' : '--';
    return `<tr onclick="location.hash='#executions/${e.id}'"><td style="color:var(--text-muted)">#${e.id}</td><td>${esc(e.workflowData?.name || e.workflowName || 'Unknown')}</td><td><span class="badge ${ok ? 'badge-success' : 'badge-error'}">${ok ? 'Success' : 'Error'}</span></td><td>${timeAgo(e.startedAt)}</td><td>${dur}</td></tr>`;
  }).join('')}</tbody></table>`;
}

window.filterExecStatus = function(status) {
  if (!status) { renderExecTable(state.executions); return; }
  const filtered = state.executions.filter(e => {
    const ok = e.finished === true;
    return status === 'success' ? ok : !ok;
  });
  renderExecTable(filtered);
};

async function renderExecutionDetail(id) {
  content().innerHTML = `<div class="detail-panel"><div class="back-link" onclick="location.hash='#executions'">${icons.back} Back to Executions</div><div class="loading"><div class="spinner"></div></div></div>`;
  try {
    const e = await api(`/executions/${id}`);
    if (e.error) { content().innerHTML = `<p>Error: ${esc(e.error)}</p>`; return; }
    const ok = e.finished === true;
    content().querySelector('.detail-panel').innerHTML = `
      <div class="back-link" onclick="location.hash='#executions'">${icons.back} Back to Executions</div>
      <h2>Execution #${e.id}</h2>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:20px">
        <span class="badge ${ok ? 'badge-success' : 'badge-error'}">${ok ? 'Success' : 'Error'}</span>
        <span style="color:var(--text-muted);font-size:13px">${esc(e.workflowData?.name || 'Unknown')}</span>
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
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Required to manage workflows via API. Find it in n8n Settings > API. The system may auto-configure this on first boot.</p>
        <div class="form-group">
          <label>API Key</label>
          <div style="display:flex;gap:8px">
            <input type="password" class="form-input" id="apiKeyInput" placeholder="Enter n8n API key..." value="${cfg.n8nApiKey || ''}">
            <button class="btn btn-primary" id="saveKeyBtn" onclick="saveApiKey(this)">Save</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>n8n Status</h3></div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="status-dot ${state.n8nOnline ? 'online' : 'offline'}"></span>
          <span style="font-size:13px">${state.n8nOnline ? 'n8n is running on port 5678' : 'n8n is offline'}</span>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px">
          <a class="btn btn-sm btn-secondary" href="http://localhost:5678/settings" target="_blank">${icons.external} n8n Settings</a>
          <a class="btn btn-sm btn-secondary" href="http://localhost:5678/credentials" target="_blank">${icons.external} Credentials</a>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>About</h3></div>
        <p style="font-size:13px;color:var(--text-muted)">Workflow Engineer is an Emika AI Employee that bundles n8n for visual workflow automation. The AI assistant can create, manage, and execute workflows via the n8n REST API.</p>
      </div>
    </div>`;
}

window.saveApiKey = async function(btn) {
  const key = $('#apiKeyInput')?.value;
  if (!key) { toast('Please enter an API key', 'error'); return; }
  setButtonLoading(btn, true, 'Saving...');
  await api('/config', { method: 'PUT', body: { n8nApiKey: key } });
  setButtonLoading(btn, false, 'Save');
  toast('API key saved');
  await checkN8nStatus();
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
function offlineMsg() { return '<div class="empty-state"><h3>n8n is offline</h3><p>Cannot connect to n8n. It may still be starting up (15-30s after container start).</p><div class="status-dot loading" style="margin:12px auto;width:12px;height:12px"></div></div>'; }

// --- Init ---
window.addEventListener('hashchange', navigate);
checkN8nStatus();
setInterval(checkN8nStatus, 15000);
navigate();

})();
