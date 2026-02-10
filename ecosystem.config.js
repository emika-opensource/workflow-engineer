module.exports = {
  apps: [{
    name: 'workflow-engineer',
    script: 'start.sh',
    interpreter: '/bin/bash',
    env: { NODE_ENV: 'production', PORT: 3000 },
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M'
  }]
};
