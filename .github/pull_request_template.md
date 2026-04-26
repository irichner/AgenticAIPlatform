## What
<!-- One sentence: what does this PR do? -->

## Why
<!-- Link to issue, or explain the motivation -->

## Test plan
- [ ] `docker compose up -d` — all services healthy
- [ ] Affected service health check passes
- [ ] Manual test of the changed flow

## Checklist
- [ ] Multi-tenant: new DB tables have RLS enabled
- [ ] No secrets in committed files (`.env` stays local)
- [ ] No debug `print()` / `console.log()` left in
- [ ] Agent changes include updated state schema if applicable
