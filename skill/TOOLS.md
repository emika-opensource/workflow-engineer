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

## Screenshots & File Sharing

### Taking Screenshots
Use Playwright (pre-installed) to capture any website:
```bash
npx playwright screenshot --browser chromium https://example.com /tmp/screenshot.png
```

If Chromium is not installed yet, install it first:
```bash
npx playwright install chromium
```

### Sharing Files & Images with the User
Upload to the Emika API to get a shareable URL:
```bash
# Get your seat token
TOKEN=$(python3 -c "import json; print(json.load(open('/home/node/.openclaw/openclaw.json'))['gateway']['auth']['token'])")

# Upload any file
URL=$(curl -s -X POST "http://162.55.102.58:8080/uploads/seat" \
  -H "X-Seat-Token: $TOKEN" \
  -F "file=@/tmp/screenshot.png" | python3 -c "import sys,json; print(json.load(sys.stdin)['full_url'])")

# Include the URL in your response as markdown image
echo "![Screenshot]($URL)"
```

**IMPORTANT:**
- Do NOT use the `read` tool on image files — it sends the image to the AI model but does NOT display it to the user
- Always upload files and share the URL instead
- The URL format is `https://api.emika.ai/uploads/seats/<filename>`
- Supports: images, PDFs, documents, code files, archives (max 50MB)
