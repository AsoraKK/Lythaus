# WP004B Phase H — Minimal GPT-OSS JSON Schema Confirmation

Phase H is a single-call capability experiment. It isolates the Phase G minimal JSON Schema output budget from provider compatibility by changing only `max_tokens` from `64` to `512`.

## Controls

- Model: `@cf/openai/gpt-oss-20b`
- Route: existing Cloudflare Workers AI `/ai/run`
- Structured output: `json_schema`
- Schema: `lythaus-wp004b-minimal-json-schema-v1`
- Prompts: the exact Phase G minimal prompts
- Temperature: `0`
- Stream: `false`
- Client timeout: `90_000ms`, opt-in only
- Maximum calls: `1`
- Retries: `0`

The minimal schema and prompts are unchanged from Phase G. The only intended provider-facing inference change is `max_tokens: 64 -> 512`. No Evidence Packet, Judge prompt, image, safety request, or full Judge schema is used.

## Documentation caveat

Cloudflare's generic Workers AI API documents `response_format.type = json_schema`, and GPT-OSS exposes `response_format`. Cloudflare's current JSON Mode supported-model list does not explicitly list `@cf/openai/gpt-oss-20b`; this experiment therefore tests empirical compatibility for this exact model and route rather than claiming documented model support.

## Interpretation

`JSON_SCHEMA_MINIMAL_CAPABILITY_CONFIRMED` requires HTTP/provider success, an existing safe envelope adapter, `finish_reason = stop`, and local validation of the unchanged minimal schema. A second call is not authorized. The default Judge mode remains `JSON_OBJECT` regardless of the result.
