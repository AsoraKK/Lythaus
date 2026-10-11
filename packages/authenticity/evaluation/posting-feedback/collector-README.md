# Bounded collector follow-up: review only

This follow-up is separate from the reviewed offline PR992. Importing it makes no
request. There is no live CLI, runtime route, Jobs wiring, credential lookup,
deployment, enforcement or public-posting activation. All executed tests use
scripted transports. No real provider observation has been collected.

The owner's bounded request already covers testing feedback on nonsensitive
artificial text. Another text-consent gate is not being requested. Remaining facts
are existing credential authority, exact provider/project scope, frozen reviewed
source, no private data, verified zero incremental execution/storage spend and
resolved local retention. Seven-day retention remains proposed, not automatic.

## Exact existing-access blocker

Service: **Cloudflare management API**. The read was:

```text
GET https://api.cloudflare.com/client/v4/accounts/<approved-account-id>/workers/scripts/lythaus-jobs-development/secrets
```

It used the already supplied management token and requested secret-name metadata
only, to check the existing binding **OPENAI_API_KEY**. It returned **HTTP401**.
No secret value was requested/read. No retry or alternate route followed. This was
neither an OpenAI provider call nor a repository metadata lookup. It does not prove
the Worker binding is absent or that OpenAI would reject it. Token expiry,
revocation, wrong authority and configuration cannot be distinguished from the
status alone; none is asserted as the cause.

The smallest supported owner action is to check the existing management token's
status and existing scope in the normal Cloudflare account management interface,
then restore that already approved authentication to this execution environment
through its normal secure configuration if possible. Do not send credentials in
chat, create a replacement credential, add scopes/grants or use another route to
evade the denial. If restoration needs new credentials/access, it is outside this
task. After owner resolution, separately establish that the existing binding is
approved for OpenAI moderation and that the approved execution context can use it;
name presence alone is not provider authentication or project-scope certification.

## Reviewed execution envelope

`collectApprovedTextProbe` accepts exactly the frozen first20 fixture projection,
SHA256 `c8882fa321e8e0073a5859814dcc86287651aa2d3b9b3170b16bd009cd6e1ed6`.
It snapshots inputs before awaits, rejects any changed/private input, and sends
only the configured model and artificial text. IDs, family/revision, declaration
and scenario labels stay local. No private user content or imported corpus is used.
These are not verified human-authored samples or an accuracy benchmark.

Preflight rejects unresolved source/hash, existing authority/provider scope,
cost, data or retention facts before transport. Facts are independently supplied
operator attestations; the collector cannot verify billing, approval or identity
itself. The actual entry uses the normal global fetch and monotonic clock, rejects
synthetic overrides, and fixes the existing OpenAI endpoint/model. It never logs a
key or reads one from the environment. A caller may supply only a binding already
approved in that execution context; copying/creating credentials is not authorized.

Maximum20 attempts, one per sample, zero automatic retries, ten-minute window,
fifteen-second per-request timeout and262144-byte response bound. Redirects remain
manual. Authentication, rate limit, outage, timeout, interruption, malformed/schema
errors, contradictory flags and model drift stop collection. Missing delivery is
unknown and cannot be replayed automatically. No fallback provider/model exists.

The actual entry requires a durable ledger. `local-ledger.mjs` supports an existing
private local execution directory: exclusive probe and attempt claims precede
requests; file and parent-directory sync precede progress; receipts use mode0600.
It rejects concurrent/restarted probes and never recovers, deletes or overwrites
claims. This requires a persistent filesystem with exclusive-create/fsync semantics.
It is **not** durable storage on an ephemeral Worker filesystem. An approved
Cloudflare execution would need its owning lane's separately reviewed existing
durable ledger integration; none is added here and no production write is allowed.

## Receipt provenance and limits

Captured bounded raw response bytes are hashed, then passed through the actual
moderation adapter before raw bytes are discarded. Known raw category flags,
scores and enum modalities are retained separately even if the adapter rejects a
returned model version. Arbitrary fields/messages/rationale are excluded. Adapter
acceptance, strict schema consistency, typed failures, response model/status/hash,
latency/missingness, declaration, unsupported authorship and authority stay separate.
No safety finding proves human authorship, calibrated probability or publication.

Receipts are frozen and registered in a private in-process ledger; JSON copies or
coherent edits cannot be committed as trusted captured receipts. Stored JSON/hash
is **not cryptographic provider authentication**, and there is no persisted-receipt
importer. Independently witness report/source hashes before using later artifacts;
deleting or rewriting the local ledger is outside this collector and would destroy
its replay guarantee. No signing credential/resource is created. Retention/deletion
is not executed automatically; it must use the resolved existing plan.

`simulateTextProbe` always marks feedback SYNTHETIC_TRANSPORT_TEST_ONLY and counts
actual provider requests as0. Positive tests never invoke the actual entry. All
numeric posting bands remain UNEVALUATED and public posting remains WITHHELD.

Run offline validation through the existing allocated evaluation CI command:

```sh
node --experimental-strip-types scripts/ci/validate-posting-feedback-evaluation.mjs
```
