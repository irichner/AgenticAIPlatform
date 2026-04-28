# MCP Gateway — Design Decisions

## D1: Scoping key

**Decision:** `org_id` (FK → `orgs.id`).

Every DB table, Redis key, and Postgres constraint in this module uses `org_id` as its tenant boundary. The lower-level `tenant` concept exists inside an org and is not relevant to the gateway layer; agents run at org scope.

## D2: auth_config storage

**Decision:** Plaintext JSONB column. No encryption at rest in the DB.

Rationale: Adding a symmetric-key encryption layer at the application level provides minimal security uplift when the DB volume is already encrypted at rest (managed cloud providers) and the risk model focuses on cross-tenant leakage rather than DB-admin access. The bigger risk is credential leakage through API responses and logs, addressed instead by:
- `pydantic.SecretStr` wrapping all sensitive fields in Pydantic schemas
- `AuthHandler.redact()` stripping secrets before any serialization
- `observability.emit_call_record()` never logging raw `auth_config`

If the threat model changes (regulatory requirement, self-hosted with shared DB), swapping to column-level encryption is a one-migration change.

## D3: Observability

**Decision:** Structured logging only (stdlib `logging` with JSON-formatted records). No OpenTelemetry in this release.

The single seam `observability.emit_call_record()` is designed to be swapped to OTel spans with one-file changes when the observability story is decided. Nothing in the gateway calls the logger directly for call records.

## D4: Manifest cache TTL

**Decision:** 600 seconds (10 minutes), configurable via `MCPGatewaySettings.manifest_cache_ttl_seconds`.

Short enough that schema changes on the upstream MCP server propagate within a reasonable window; long enough to avoid hammering tools/list on every agent run.

## D5: Budget defaults

**Decision:** `max_tool_calls_per_run = 30`, `max_wall_time_seconds = 180` (3 minutes).

Per-registration overrides take precedence. These defaults are intentionally conservative for an enterprise context where runaway tool-call loops have dollar-cost implications.

## D6: Idempotency TTL

**Decision:** 24 hours for outcome records, 1 hour expiry for orphan (pending → error) reaping.

Orphan threshold: 5 minutes. A run that is still `pending` after 5 minutes is assumed dead (container restart, OOM). The sweeper sets `status='error'` with `reason='gateway_restart_orphan'` so callers see a clear failure rather than a hung state.

## D7: Sanitizer limits

**Decision:** 64 KB max result size, 16 levels max recursion depth.

Results exceeding either limit are truncated with a sentinel `"[TRUNCATED]"` suffix, not rejected, so the agent can still observe partial results and decide what to do.

## D8: Sampling policy

**Decision:** Default-deny. `sampling/createMessage` requests from upstream MCP servers are intercepted in `MCPClient` and rejected with JSON-RPC error `-32601` (Method not found).

MCP sampling is a privileged operation that lets an external server drive the LLM. Granting this by default violates least-privilege. An explicit `sampling_policy = 'allow'` registration flag can enable it per-server when the use case is reviewed.
