# WP004B Phase I — Full B1 JSON Schema Confirmation

## Purpose

Phase I is a single-call capability experiment following the successful Phase H minimal JSON Schema confirmation. It tests whether the complete packet-aware `lythaus-judge-json-schema-v1` can execute for the existing B1 neutral-stress Evidence Packet on the existing Cloudflare `/ai/run` route.

This is not an authenticity benchmark, an Observer benchmark, a production-readiness result, or evidence that JSON Schema improves Judge reasoning.

## Fixed controls

- Model: `@cf/openai/gpt-oss-20b`
- Prompt: `lythaus-gpt-oss-judge-prompt-v3`
- Packet: `WP004B_LIVE_NEUTRAL_STRESS_01`, built by the existing deterministic Phase B/D/F machinery
- Output mode: explicit `JSON_SCHEMA`
- Schema: `lythaus-judge-json-schema-v1`
- Expected B1 schema fingerprint: `4ebedc2cc257c5a02bb3ca26afcc23c8b28b3c670ffd833e575c09360b269c8a`
- Expected schema character length: `3758`
- Temperature: `0`
- Output allowance: `2400`
- Transport deadline: `90000ms`, opt-in to this experiment only
- Calls: one GPT-OSS attempt, zero retries, no fallback

The existing Judge request builder retains its established non-streaming `/ai/run` shape; the generation report records `stream: false` as the unchanged control. Phase I does not add a new request field or alter the JSON_OBJECT default.

## Validation order

The runner validates the exact B1 packet, builds and compiles the schema with Ajv, verifies the fixed fingerprint and length, checks that the Safety context ID is excluded from origin-reference enums, checks that expectations are absent from the request, then reserves the single call. Provider output is still normalized by the existing explicit adapters, parsed by the canonical Judge parser, and evaluated by the WP004B epistemic policy.

Only safe structural diagnostics and a canonical validated JudgeRecommendation can be retained. Raw provider bodies, message content, reasoning, tool arguments, credentials, and image bytes are excluded.

## Bounded outcomes

The runner distinguishes timeout, explicit provider rejection, truncation, canonical failure, epistemic failure, and clean confirmation. A clean result under 30 seconds is `B1_FULL_JSON_SCHEMA_CONFIRMED`; a clean result above 30 seconds but within 90 seconds is `B1_FULL_JSON_SCHEMA_CONFIRMED_SLOW`. No result authorizes B2 or B3 automatically.

## Accounting and artifacts

The Phase I accounting profile is a dedicated one-case `B1` profile with a global and per-case cap of one. Reservation occurs before transport; the journal remains authoritative if normalization or later evaluation fails. The manual workflow finalizes accounting with `if: always()` and uploads only three staged sanitized files: the final result, call accounting, and budget finalizer.

The runtime default remains `JSON_OBJECT`. A successful Phase I result would justify a separately authorized B2/B3 JSON Schema completion experiment; it does not promote JSON Schema automatically.
