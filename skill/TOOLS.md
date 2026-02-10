# Tools Reference

## n8n API (port 5678)

Base: `http://localhost:5678/api/v1`
Auth: `X-N8N-API-KEY: <key>`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /workflows | List workflows |
| POST | /workflows | Create workflow |
| GET | /workflows/:id | Get workflow |
| PUT | /workflows/:id | Update workflow |
| DELETE | /workflows/:id | Delete workflow |
| POST | /workflows/:id/activate | Activate |
| POST | /workflows/:id/deactivate | Deactivate |
| POST | /workflows/:id/run | Execute |
| GET | /executions | List executions |
| GET | /executions/:id | Get execution |
| GET | /credentials | List credentials |

## Companion API (port 3000)

Base: `http://localhost:3000/api`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /status | n8n health check |
| GET | /workflows | List workflows (proxy) |
| POST | /workflows | Create workflow (proxy) |
| GET | /workflows/:id | Workflow detail |
| POST | /workflows/:id/execute | Execute workflow |
| GET | /templates | List templates (?category=) |
| GET | /templates/:id | Template detail + n8n JSON |
| POST | /templates/:id/deploy | Deploy template to n8n |
| GET | /connectors | List connectors (?category=&search=) |
| GET | /connectors/:name | Connector setup guide |
| GET | /analytics | Execution stats |
| GET | /config | Get config |
| PUT | /config | Update config |
| GET | /executions | List executions (proxy) |
