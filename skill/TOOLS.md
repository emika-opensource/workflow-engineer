---
name: workflow-engineer
description: AI-powered workflow automation dashboard proxying n8n — manage workflows, executions, templates, connectors, and config
---

## ⛔ NEVER write data as files. ALWAYS use the API.

## CRITICAL: Port 3000 Only
You MUST deploy ONLY on port 3000. Nginx ONLY proxies port 3000 — any other port will NOT be accessible.
If port 3000 is busy: `pm2 delete all` then `pm2 start your-app.js --name app` on port 3000.

## 🚨 Your App is ALREADY RUNNING
Your **Workflow Engineer** web application is ALREADY RUNNING on port 3000.
- **DO NOT** kill anything on port 3000
- **DO NOT** try to start a new server
- All API endpoints below are served by this app at `http://localhost:3000`

## API Endpoints Summary

| Category | Endpoints |
|----------|-----------|
| Status | `GET /api/status` |
| Config | `GET/PUT /api/config` |
| Workflows | `GET/POST /api/workflows`, `GET/PUT/DELETE /api/workflows/:id` |
| Workflow Actions | `POST /api/workflows/:id/activate`, `POST /api/workflows/:id/deactivate`, `POST /api/workflows/:id/execute` |
| Executions | `GET /api/executions`, `GET /api/executions/:id` |
| Templates | `GET /api/templates`, `GET /api/templates/:id`, `POST /api/templates/:id/deploy` |
| Connectors | `GET /api/connectors`, `GET /api/connectors/:name` |
| Analytics | `GET /api/analytics` |

## Detailed API Reference

### Status

**Check n8n connectivity**:
```bash
curl http://localhost:3000/api/status
```
Response:
```json
{
  "n8n": "running",
  "statusCode": 200,
  "configured": true,
  "firstRun": false
}
```
Possible `n8n` values: `running`, `error`, `offline`.

### Config

**Get config** (API key masked):
```bash
curl http://localhost:3000/api/config
```
Response:
```json
{
  "n8nApiKey": "****abcd",
  "preferences": { "theme": "dark" },
  "connectedServices": [],
  "setupComplete": true
}
```

**Update config**:
```bash
curl -X PUT http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "n8nApiKey": "your-n8n-api-key",
    "preferences": { "theme": "dark" },
    "setupComplete": true
  }'
```
Allowed fields: `n8nApiKey`, `preferences`, `connectedServices`, `setupComplete`.

### Workflows (proxied to n8n)

**List all workflows**:
```bash
curl http://localhost:3000/api/workflows
```

**Create a workflow**:
```bash
curl -X POST http://localhost:3000/api/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Workflow",
    "nodes": [],
    "connections": {},
    "settings": {}
  }'
```

**Get a workflow**:
```bash
curl http://localhost:3000/api/workflows/WORKFLOW_ID
```

**Update a workflow**:
```bash
curl -X PUT http://localhost:3000/api/workflows/WORKFLOW_ID \
  -H "Content-Type: application/json" \
  -d '{ "name": "Updated Name", "active": true }'
```

**Delete a workflow**:
```bash
curl -X DELETE http://localhost:3000/api/workflows/WORKFLOW_ID
```

**Activate a workflow**:
```bash
curl -X POST http://localhost:3000/api/workflows/WORKFLOW_ID/activate
```

**Deactivate a workflow**:
```bash
curl -X POST http://localhost:3000/api/workflows/WORKFLOW_ID/deactivate
```

**Execute a workflow** (manual run):
```bash
curl -X POST http://localhost:3000/api/workflows/WORKFLOW_ID/execute \
  -H "Content-Type: application/json" \
  -d '{ "data": { "key": "value" } }'
```

### Executions

**List executions**:
```bash
curl http://localhost:3000/api/executions
curl "http://localhost:3000/api/executions?limit=20&workflowId=WORKFLOW_ID"
```
Query params are forwarded to n8n.

**Get execution details**:
```bash
curl http://localhost:3000/api/executions/EXECUTION_ID
```

### Templates

**List templates** (with optional category filter):
```bash
curl http://localhost:3000/api/templates
curl "http://localhost:3000/api/templates?category=marketing"
```
Response: Array of template objects (without n8nJson for list view).

**Get template details** (includes n8nJson):
```bash
curl http://localhost:3000/api/templates/TEMPLATE_ID
```

**Deploy a template** (creates workflow in n8n):
```bash
curl -X POST http://localhost:3000/api/templates/TEMPLATE_ID/deploy
```
Response:
```json
{
  "ok": true,
  "workflow": { "id": "...", "name": "..." },
  "webhookUrl": { "test": "http://localhost:5678/webhook-test/path", "production": "http://localhost:5678/webhook/path" },
  "credentialsNeeded": [{ "node": "Slack", "connector": "Slack", "authType": "oauth2" }]
}
```

### Connectors

**List connectors** (with optional filters):
```bash
curl http://localhost:3000/api/connectors
curl "http://localhost:3000/api/connectors?category=communication"
curl "http://localhost:3000/api/connectors?search=slack"
```

**Get connector details**:
```bash
curl http://localhost:3000/api/connectors/CONNECTOR_NAME
```

### Analytics

**Get workflow analytics**:
```bash
curl http://localhost:3000/api/analytics
```
Response:
```json
{
  "totalWorkflows": 5,
  "activeWorkflows": 3,
  "totalExecutions": 100,
  "successCount": 85,
  "errorCount": 15,
  "successRate": 85,
  "recentExecutions": [...],
  "execError": null
}
```
