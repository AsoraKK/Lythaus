# OpenAPI Workflows

## Editing the spec
- Update `api/openapi/openapi.yaml` for any contract changes.
- Product-integrity route items and focused schemas live in `api/openapi/product-integrity.yaml` and are referenced from the canonical root; do not replace the root with the fragment.
- Run the lint and bundle commands before committing to catch validation issues.
- Keep response schemas aligned with the native Lythaus Workers to prevent contract drift.
- Comments and replies are created in `under_review`; public availability follows the moderation lifecycle rather than successful submission alone.
- Completed privacy exports are raw private JSON attachments (`private, no-store`), not API envelopes; email verification returns only `{ "state": "verified" }` with the same cache policy.
- Neutral anti-abuse limits return stable `429` errors: `flag_daily_limit_reached`, `media_daily_limit_reached`, `relationship_change_limit_reached`, and `export_cooldown_active`. These limits protect interaction integrity without using authenticity scores as an enforcement authority.

## Contract validation
- `npm run openapi:test:contract` checks bundled request/response examples and bidirectional Worker-route parity.
- `npm run openapi:test:dart` builds and tests the generated Dart package in an isolated copy.

## Tooling commands
- `npm run openapi:lint` – Validate the spec with Redocly rules.
- `npm run openapi:bundle` – Emit the bundled JSON to `api/openapi/dist/openapi.json`.
- `npm run openapi:gen:dart` – Refresh the generated Dart client under `lib/generated/api_client/`.

## Generated client usage
- Flutter builds can import the client via: `import 'package:lythaus/generated/api_client.dart';`.
- The export exposes `DefaultApi` and related models from `lib/generated/api_client/lib/api.dart`.
- The `dart-dio` generator uses `https://api.lythaus.co/api` by default and does not select an operation-level server. For Cloudflare Access-protected admin operations, construct a separate client with `basePathOverride: 'https://admin-api.lythaus.co/api'`, then call `setApiKey('cloudflareAccess', accessJwt)` before obtaining `AdminApi`. Do not use that overridden client for public calls.
