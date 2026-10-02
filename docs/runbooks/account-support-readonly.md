# Owner account support

The Control Panel's `/account-support` page lets an active owner review one account by exact email, then inspect recorded history. Each lookup and history read requires a stable support reason code and a successful audit write. This feature reads account state; the only database writes are the existing admin rate limiter and support audit events.

## Access and lookup

Cloudflare Access verification, active admin membership and the existing rate limiter run before the support router. The router then checks an active `owner` membership joined to an active owner user. A revoked membership, non-owner role or inactive owner account fails closed. The UI's access check is informational; every data request independently enforces authorization.

| Method | Admin path | Request |
| --- | --- | --- |
| GET | `/api/admin/account-support/access` | Returns only `available: true` for an active owner. |
| POST | `/api/admin/account-support/lookup` | JSON `email` and `reasonCode`. |
| POST | `/api/admin/account-support/users/{uuid}/history` | JSON `reasonCode` and optional history filters. |

Support POSTs require the configured same origin and `application/json`. Request and delegated response bodies are bounded to 4 KiB. The email is sent in the request body, never a URL. Normalization matches email authentication: trim and lowercase, without alias expansion or substring search.

The existing `AUTH_EMAIL_ENVELOPE` service binding invokes `/keeper-account-support/lookup` through the public Worker's existing `AuthEmailEnvelope` named entrypoint. That path is absent from the default public HTTP router. The private handler independently verifies the active owner and uses the public Worker's existing HMAC key and runtime database role. No email keys are copied into Admin, and no grants, bindings or provider resources are added. The admin adapter retains candidate Worker version pinning and a five-second timeout.

A canonical contact email takes precedence over credentials. Credential-only records can match when no contact row exists. A stale credential address cannot match a different canonical contact address. Cross-table conflicts return `state: ambiguous` and no account data; missing matches return `state: not_found`. Both outcomes are audited without a guessed target.

Returned account fields are limited to UUID, status, verification state and timestamp, creation/update/deletion timestamps, last recorded email sign-in, unrevoked/unexpired session count with unrevoked token families, and subscription tier. A missing sign-in remains null, rather than using account creation as a substitute. Passwords, token values, reset links, email ciphertext/HMAC, private content and provider identifiers are excluded. The delegated projection is validated and copied through an explicit field allowlist.

Admin rechecks owner state after private lookup, then commits `identity.account_support_lookup` before disclosing the result. The audit records actor, matched target UUID when present, reason, request correlation and outcome. It retains neither the raw email nor its lookup HMAC. Audit failure returns unavailable and no account data.

## Recorded history

History combines only records for the selected account from:

- `identity.account_events`, selected by `user_id`.
- `trust.user_activity_events`, selected by `user_id`.
- `system.audit_events`, selected by `target_type = 'user'` and `target_id`.

Responses contain event UUID, source, machine event/action code, timestamp, recorded correlation/reason codes, category and recorded outcome. They omit metadata, titles, explanations, bodies and unrelated accounts. Correlation IDs are not available on identity account events, so those fields remain null. Events from different sources remain distinguishable even when UUID and timestamp coincide.

Filters are `source` (`account`, `activity`, `audit`), exact `eventType`, exact `correlationId`, inclusive `since`, exclusive `until`, and `order` (`newest` by default, or `oldest`). Date filters use UTC ISO timestamps. The UI converts local date inputs to UTC and labels displayed dates as UTC. `limit` is an integer from 1 to 50, default 25.

Keyset cursors include account/filter/order scope, a first-page timestamp boundary and the exact `(created_at, id, source)` position. PostgreSQL microseconds are preserved, with source compared using `C` collation for ties. Changing accounts or filters requires a new first page. Each read uses `clock_timestamp()` for its audit entry so pagination excludes newly generated read audits after the first boundary. A cursor is a pagination position, not an authorization capability.

Every successful history request commits `identity.account_support_history_viewed`. Audit metadata contains page size, order, source and filter-presence flags; it omits filter values and account content. Replies use `private, no-store` and an `X-Correlation-ID` header.

History always declares partial coverage. Older activity may never have been recorded or may have been removed by retention or deletion. An empty filtered page is not proof of no activity. Missing storage, failed queries and failed audits return unavailable, rather than an empty successful page. UI errors replace old results; a failed additional page preserves the already displayed page with an explicit retry message. Clear, account changes, authorization loss and stale async replies discard prior account context.

## Validation and integration

Focused commands from the repository root after activating the saved runtime:

```sh
node --experimental-strip-types --experimental-test-module-mocks --test packages/contracts/tests/account-support.test.mjs apps/lythaus-admin-api/tests/account-support-runtime.test.mjs apps/lythaus-admin-api/tests/account-support-handler.test.mjs
npm --prefix apps/control-panel test
npm --prefix apps/control-panel run build
npm run typecheck:native
npm run test:critical-coverage
node --test --test-timeout=60000 scripts/tests/private-email-binding.workerd.mjs
```

`apps/lythaus-admin-api/tests/account-support.postgres.mjs` requires a complete baseline in disposable local PostgreSQL 17 and rejects remote hosts. Use a database with the `lythaus_auth_test` prefix, or the existing CI PostgreSQL service. Its three tests exercise the real runtime/admin grants, exact lookup and ambiguity, non-owner/inactive-owner denial, audit rollback, timestamp/source ties, date filters, scoped correlation and snapshot pagination. Fixtures are synthetic; no mail is sent.

Control-panel browser validation uses synthetic API responses. Chromium flows at 390, 768 and 1440 pixels cover lookup, pagination, correlation, source/order filters, missing accounts, unavailable history, clear and owner denial. The Browser plugin was unavailable, so regular Playwright used retained browser caches. The existing Google Fonts import fails certificate validation in the cloud browser; fallback fonts render, and TLS verification remains enabled. Browser evidence and scripts stay outside the repository.

Parent integration must reconcile the shared admin router, named public service entrypoint, App/Nav, contracts export, both CI workflows and critical-coverage manifest. The root npm manifests and locks are unchanged. The existing PostgreSQL CI glob includes the three new database tests, while the main CI explicitly invokes support API tests and the expanded coverage gate.

Reputation activity is historical recorded evidence only; this lane adds no earning policy, entitlement calculation or repair. Password/reset, session revocation, impersonation, deletion and reputation repair remain outside this support page. Parent owns serialized merges and exact-SHA owner-testing releases. Real owner email/signup acceptance remains pending mailbox setup; local tests do not establish production acceptance. If the uncommitted PC implementation becomes available, reconcile it against this reconstruction before integration.
