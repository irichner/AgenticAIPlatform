# MCP Gateway — Threat Model (STRIDE)

## Trust boundaries

```
[Agent executor]  →  [MCPGateway]  →  [External MCP server]
       ↕                   ↕
  [LangGraph]          [Redis/Postgres]
```

Three boundaries:
1. **B1** — Agent executor → MCPGateway (in-process call, DB auth check)
2. **B2** — MCPGateway → External MCP server (outbound HTTPS)
3. **B3** — MCPGateway → Redis/Postgres (internal network, no auth bypass expected)

---

## STRIDE analysis

### Spoofing

| Asset | Threat | Mitigation |
|---|---|---|
| Org identity (B1) | Agent executor passes wrong org_id | `resolve_org` dependency validates `X-Org-Id` header against session membership; gateway re-checks `registration.org_id == org_id` on every call |
| MCP server identity (B2) | DNS hijack / MITM on outbound call | httpx verifies TLS certificates by default; no `verify=False` anywhere; EgressGuard enforces allowlist of registered hostnames |

### Tampering

| Asset | Threat | Mitigation |
|---|---|---|
| Tool arguments (B1→B2) | Agent injects malicious tool_args to pivot to unauthorized actions | RBACChecker.assert_allowed gates tool name; OutputSanitizer validates response schema; guardrail prompt frames result interpretation |
| Idempotency outcome (B3) | Race condition allows double-execution | Postgres UNIQUE constraint + `status='pending'` lock; `SELECT FOR UPDATE` in OutcomeCache.claim |
| ManifestSnapshot (B3) | Snapshot tampered after capture to allow new tools | Snapshot is written once (INSERT), never updated; call path re-reads snapshot from DB, not cache |

### Repudiation

| Asset | Threat | Mitigation |
|---|---|---|
| Tool call (B1→B2) | No audit trail for MCP calls | `observability.emit_call_record()` writes structured log with org_id, run_id, registration_id, tool_name, input hash, result hash, latency_ms |
| Credential change | Admin claims they didn't rotate credential | `emit_call_record` includes `credential_hash`; RevocationBus event is logged with actor user_id |

### Information disclosure

| Asset | Threat | Mitigation |
|---|---|---|
| API key in auth_config | Key leaked via GET /mcp/registrations response | **All `auth_config` serialization goes through `AuthHandler.redact()` which replaces secret values with `"***"` before any JSON response is built. This is enforced in the Pydantic schema via `SecretStr` + `__get_validators__` and in the router via explicit redact call.** |
| Tool result contains PII | Result logged verbatim | `emit_call_record` logs SHA-256 of args and result, never the raw values |
| Cross-tenant manifest leak | Redis cache key collides across orgs | Cache key includes `org_id`: `mcp:manifest:{org_id}:{reg_id}:{cred_hash}` |

### Denial of service

| Asset | Threat | Mitigation |
|---|---|---|
| Runaway tool calls | Agent loops indefinitely | BudgetEnforcer Redis Lua script enforces `max_tool_calls_per_run`; exceeding it returns HTTP 429 |
| Slow upstream server | Agent hangs waiting for MCP response | `max_wall_time_seconds` wall-clock budget enforced in BudgetEnforcer; httpx timeout per call |
| Bad MCP server floods 5xx | Gateway retries amplify load | Circuit breaker: 5 consecutive 5xx → OPEN state; refuses further calls until reset window expires |

### Elevation of privilege

| Asset | Threat | Mitigation |
|---|---|---|
| Cross-org registration access | User reads another org's registrations | EgressGuard checks that `registration.org_id == calling_org_id`; all DB queries filter on org_id |
| Sampling escalation | MCP server requests `sampling/createMessage` to drive LLM | **MCPClient intercepts all server-initiated `sampling/createMessage` requests and rejects them with JSON-RPC `-32601`. This is unconditional unless `sampling_policy = 'allow'` is set on the registration.** |
| RBAC bypass via unknown tool | Agent calls a tool not listed in ToolPermission | RBACChecker.assert_allowed raises 403 for any tool_name not in the snapshot; default-deny |

---

## Residual risks

- `auth_config` is plaintext at rest in Postgres. Mitigated by DB-level encryption at the infrastructure layer (provider responsibility). Application-layer encryption is deferred (see D2 in decisions.md).
- mTLS and OAuth2 are not implemented (`NotImplementedError`). Any attempt to register a server requiring these auth types will fail at registration validation, preventing silent fallback to unauthenticated calls.
- The guardrail prompt (`TOOL_RESULT_GUARDRAIL_BASE`) is a defense-in-depth control, not a security boundary. A sufficiently adversarial tool result can still influence model behavior.
