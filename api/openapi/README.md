# OpenAPI Workflows

## Editing the spec
- Update `api/openapi/openapi.yaml` for any contract changes.
- Run the lint and bundle commands before committing to catch validation issues.
- Keep response schemas aligned with the native Lythaus Workers to prevent contract drift.

## Tooling commands
- `npm run openapi:lint` – Validate the spec with Redocly rules.
- `npm run openapi:bundle` – Emit the bundled JSON to `api/openapi/dist/openapi.json`.
- `npm run openapi:gen:dart` – Refresh the generated Dart client under `lib/generated/api_client/`.

## Generated client usage
- Flutter builds can import the client via: `import 'package:lythaus/generated/api_client.dart';`.
- The export exposes `DefaultApi` and related models from `lib/generated/api_client/lib/api.dart`.
