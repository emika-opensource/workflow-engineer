#!/bin/bash
cd /home/node/app

# Install Express app deps
npm install 2>/dev/null || true

# Create n8n data directory
mkdir -p /home/node/emika/n8n-data

# Start Express companion app first (serves dashboard on port 3000)
echo "Starting dashboard on port 3000..."
node server.js &
DASHBOARD_PID=$!

# Start n8n in background on port 5678 with /n8n path prefix
export N8N_USER_FOLDER=/home/node/emika/n8n-data
export N8N_PORT=5678
export N8N_PROTOCOL=http
export N8N_HOST=localhost
export N8N_PATH_PREFIX=/n8n
export GENERIC_TIMEZONE=UTC
export N8N_RUNNERS_ENABLED=true
export N8N_SECURE_COOKIE=false
export N8N_EDITOR_BASE_URL=/n8n/
n8n start &
N8N_PID=$!

# Wait for n8n to be ready
echo "Waiting for n8n to start..."
for i in $(seq 1 30); do
    if curl -s http://localhost:5678/n8n/healthz > /dev/null 2>&1; then
        echo "n8n is ready on /n8n!"
        break
    fi
    sleep 2
done

# Keep running (wait for dashboard process)
wait $DASHBOARD_PID
