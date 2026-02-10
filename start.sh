#!/bin/bash
cd /home/node/app

# Install Express app deps
npm install 2>/dev/null || true

# Install n8n globally if not present
if ! command -v n8n &> /dev/null; then
    echo "Installing n8n..."
    npm install -g n8n 2>/dev/null || true
fi

# Create n8n data directory
mkdir -p /home/node/emika/n8n-data

# Start n8n in background on port 5678
export N8N_USER_FOLDER=/home/node/emika/n8n-data
export N8N_PORT=5678
export N8N_PROTOCOL=http
export N8N_HOST=localhost
export GENERIC_TIMEZONE=UTC
export N8N_RUNNERS_ENABLED=true
export N8N_SECURE_COOKIE=false
n8n start &

# Wait for n8n to be ready
echo "Waiting for n8n to start..."
for i in $(seq 1 30); do
    if curl -s http://localhost:5678/healthz > /dev/null 2>&1; then
        echo "n8n is ready!"
        break
    fi
    sleep 2
done

# Start Express companion app
exec node server.js
