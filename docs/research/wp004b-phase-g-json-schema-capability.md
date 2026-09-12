# WP004B Phase G — JSON Schema Capability and Timeout Isolation

Status: software implementation ready for one conditional live probe.

## Purpose

Phase G separates JSON Schema capability on the existing Cloudflare Workers AI
`/ai/run` route from the latency of the full Lythaus Judge prompt, packet, and
packet-aware schema. It authorizes at most two GPT-OSS attempts:

1. G1: a minimal structured-output capability probe.
2. G2: the exact Phase F B1 Judge request, only after G1 succeeds.

There are no OpenAI, Moondream, image, fallback, or retry calls.

## Phase F timeout source

The Phase F approximately 30-second boundary came from the default in
`createCloudflareRestTransport` (`packages/authenticity/src/cloudflare-rest.ts`):
`timeoutMs` defaults to `30_000`. Each transport invocation creates an
`AbortController`, starts a timeout promise, aborts the fetch on expiry, and
rejects with the controlled `TIMEOUT` error. The Phase F runner did not pass an
override. `createCloudflareJudgeRest` does not add a second deadline on this
path, and the workflow/process did not establish the observed 30-second
boundary.

Phase G passes `90_000` only to its dedicated transport. The default remains
30 seconds, including existing JSON_OBJECT Judge calls.

## Probe contract

G1 uses `@cf/openai/gpt-oss-20b`, the existing `/ai/run` transport, temperature
`0`, `stream:false`, `max_tokens:64`, and a minimal `json_schema` requiring only
`success:true`. It sends no Evidence Packet and no Judge prompt.

G2 uses the exact existing B1 packet, prompt v3, Judge schema v1, JSON Schema
mode, temperature `0`, `max_tokens:2400`, and the same endpoint. Its only
intentional runtime difference from Phase F is the 90-second client deadline.

Both probes use explicit provider-envelope adapters, canonical local checks,
atomic sanitized call accounting, a two-attempt global cap, and zero retries.
Raw provider responses, message content on failure, reasoning, tool arguments,
secrets, images, and Base64 are never retained.

## Interpretation

G1 success establishes only minimal JSON Schema capability for this model and
route. G2 success establishes full Lythaus schema compatibility; success after
30 seconds is reported as slow. A timeout or explicit provider rejection keeps
`JSON_OBJECT` as the default and requires a separately reviewed experiment.

This phase does not establish authenticity accuracy, production readiness, or
general JSON Schema performance.
