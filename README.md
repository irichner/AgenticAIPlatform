# Lanara — Revenue Operations OS

**Vertical AI Agent Platform for SPM + CRM**

## Quick Start (Windows + WSL2)

1. Copy `.env.example` → `.env` and fill secrets
2. `docker-compose up --build` (first run takes ~2 min)
3. Open http://localhost:3000 → you should see "Hello from Lanara"
4. Backend API docs: http://localhost:8000/docs

## Development Workflow

- **Frontend**: Next.js 15 (App Router) — hot reload on save
- **Backend**: FastAPI — auto-reload
- **Database**: Postgres + pgvector (RLS ready)
- **Cache**: Redis

All commands work identically in WSL2 or native Linux.

## Next Phase
When you type `YES`, we move to Phase 1 (Real Next.js 15 + React Flow spatial canvas with liquid-glass UI).