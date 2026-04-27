# Lanara — AgenticAIPlatform

Agentic AI OS: agent-native, enterprise-first. Targeting $50k–$500k+ ARR enterprise sales teams.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript 5, Tailwind CSS 4, React Flow, shadcn/ui |
| Backend | FastAPI 0.115, Python 3.12, SQLAlchemy 2.0, Alembic, asyncpg |
| Database | PostgreSQL 16 + pgvector, Redis 7 |
| Agents | LangGraph (stateful multi-agent), MCP integration layer |
| Models | Anthropic Claude (primary), LiteLLM proxy, Ollama (local dev) |
| Auth | Auth0 SSO/SAML/SCIM (Phase 3) |
| Observability | Langfuse, Prometheus + Grafana (Phase 4) |

## Services & Ports (local dev)

| Service | Port |
|---|---|
| Frontend (Next.js) | 3000 |
| Backend (FastAPI) | 8000 |
| PostgreSQL | 5433 |
| Redis | 6379 |
| MCP — SPM | 8001 |
| MCP — Postgres | 8012 |
| MCP — Filesystem | 8023 |
| MCP — Google Drive | 8024 |
| Ollama | 11434 |

## Running locally

```bash
cp .env.example .env   # fill in ANTHROPIC_API_KEY at minimum
docker compose up -d
```

## Core invariants

**Multi-tenancy first.** Every DB table needs RLS. Every request needs tenant context. Do not add a feature without tenant isolation — this is a P0 enterprise requirement.

**Agent-native.** Business logic lives in LangGraph agents, not in REST controllers. Controllers coordinate; agents execute.

**Human-in-the-loop.** Irreversible actions (quota changes, clawbacks, SPIF payouts) require an approval flow before execution.

## Directory structure

```
backend/          FastAPI app, LangGraph agents, Alembic migrations
frontend/         Next.js app (App Router, React 19)
mcp-servers/      MCP integration servers: spm, postgres, filesystem, gdrive
infra/            Docker Compose overrides, K8s manifests (Month 5+)
agents/           Shared agent definitions (standalone, reusable across services)
docs/             Architecture decisions, API specs
ProjectDocs/      Founder vision docs — read-only reference
```

## Commit conventions

Use conventional commits with scope:

```
feat(agents): add quota forecaster LangGraph node
fix(api): correct RLS policy on business_units table
chore(infra): add K8s health probe for mcp-spm
```

Scopes: `agents`, `api`, `frontend`, `mcp`, `infra`, `db`, `auth`

## CI/CD

GitHub Actions run per-service (path-filtered):
- `.github/workflows/ci-api.yml` — triggers on `backend/**`
- `.github/workflows/ci-web.yml` — triggers on `frontend/**`
- `.github/workflows/ci-mcp.yml` — triggers on `mcp-servers/**`

Docker images pushed to GHCR: `ghcr.io/irichner/lanara-{api,web,mcp-*}:{main,<sha>}`
