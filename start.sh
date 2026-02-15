#!/bin/bash
cd /home/node/app

# Create n8n data directory
mkdir -p /home/node/emika/n8n-data

# Start n8n directly on port 3000 (nginx proxies / to 3000)
export N8N_USER_FOLDER=/home/node/emika/n8n-data
export N8N_PORT=3000
export N8N_PROTOCOL=http
export N8N_HOST=localhost
export GENERIC_TIMEZONE=UTC
export N8N_RUNNERS_ENABLED=true
export N8N_SECURE_COOKIE=true
export N8N_PROXY_HOPS=2

echo "Starting n8n on port 3000..."
exec n8n start
