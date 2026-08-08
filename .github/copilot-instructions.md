# Copilot instructions

## Product and runtime

- Product and internal name: Lythaus.
- Do not introduce the retired product name in active code, paths, identifiers, packages, infrastructure, documentation, or metadata.
- Azure was fully deleted on 6 August 2026. Do not add Azure dependencies, deployment paths, credentials, or fallbacks.
- Cloudflare Workers under `apps/lythaus-*` are the only backend services.
- PlanetScale PostgreSQL `lythaus/lythaus-core` is canonical and is accessed through Hyperdrive.
- Email and guest access are the only initial authentication flows.
- Hive, Google sign-in, Apple sign-in, World ID, Entra, B2C, and generic OAuth provider selection are prohibited.
- Authenticity logic belongs in provider-neutral Lythaus-owned code under `packages/authenticity/`.

## Development

- Follow `AGENTS.md` and the current architecture in `docs/architecture/lythaus-domain-architecture.md`.
- Flutter features live under `lib/features/<feature>` with domain, application, and presentation layers.
- Shared Worker code belongs under `packages/`; do not import from deleted or compatibility workspaces.
- Use Cloudflare bindings for platform services and Hyperdrive for PostgreSQL.
- Use application-generated UUIDv7 values stored in native PostgreSQL `uuid` columns.
- Never hard-code secrets or place secret values in source, examples, evidence, logs, or generated artifacts.

## Validation

```powershell
npm ci --ignore-scripts
npm run typecheck:native
npm run test:native-architecture
npm run validate:native-workers
npm run validate:planetscale-migrations
flutter pub get
flutter analyze
flutter test
```

Historical commits and files under `docs/history/` may retain accurate retired terminology. Do not copy historical implementation guidance into active code.
