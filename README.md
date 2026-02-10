# Workflow Engineer — Emika AI Employee

AI-powered workflow automation expert bundling **n8n** for visual workflow building.

## Architecture

- **n8n** (port 5678) — Open-source workflow automation engine
- **Companion Dashboard** (port 3000) — Express app with curated UI, templates, and connector guides
- **AI Skill** — The AI is an n8n expert that creates/manages workflows via REST API

## Quick Start

```bash
./start.sh
```

This starts n8n in background (port 5678) and the Express dashboard (port 3000).

## Features

- 12 pre-built workflow templates ready to deploy
- 30+ connector setup guides with auth instructions
- Real-time dashboard with execution stats
- Embedded n8n editor access
- AI-assisted workflow creation and management

## Files

| File | Purpose |
|------|---------|
| `start.sh` | Starts n8n + Express app |
| `server.js` | Express companion dashboard |
| `public/` | Frontend SPA (dashboard, templates, connectors) |
| `skill/SKILL.md` | AI knowledge base (n8n API, patterns, recipes) |
| `skill/TOOLS.md` | Concise API reference |
| `BOOTSTRAP.md` | Onboarding flow for new users |
