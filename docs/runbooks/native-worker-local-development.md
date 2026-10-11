# Native Worker local development

The three native Worker top-level Wrangler configurations are production
configurations. Their existing `-development` Worker names and `-dev` resource
names were promoted in place; these names do not identify isolated development
resources. Canonical release commands use the top-level configuration.

Each configuration retains an explicit empty `"env": {}`. Wrangler rejects
ordinary named `--env`, `-e`, and `CLOUDFLARE_ENV` selections before deployment.
Do not delete the empty object: Wrangler treats a missing `env` as a warning
and can inherit production bindings for an unknown environment. Do not add a
hosted development alias or enable remote development against these resources.

The native-config SOURCE validator additionally rejects any nonempty
`CLOUDFLARE_ENV` and any command-line configuration override. This covers
Wrangler's inherited-object selector edge cases, including `__proto__`, in
supported release paths. Use the reviewed release workflows: invoking raw
Wrangler with undeclared inherited-object selectors bypasses that source check
and is unsupported. The pinned parser can inherit Admin routes for such an
input; an empty `env` object alone is not a universal raw-CLI safety boundary.

Use the repository's local synthetic fixtures for development. Workerd fixtures
construct Miniflare bindings explicitly, deny external requests and use a
disposable PostgreSQL fixture where a database is needed. They do not read
production secrets or deploy the Wrangler configurations. For example:

```sh
node --test scripts/tests/native-worker-config.test.mjs
node --experimental-strip-types --test apps/lythaus-jobs/tests/post-moderation.workerd.mjs
node --experimental-strip-types --test apps/lythaus-jobs/tests/post-safety-evidence.workerd.mjs
```

The configuration regression tests cover all three Workers, their exact
reviewed top-level configuration and named-environment rejection. The existing
post fixtures refuse outbound requests and require a disposable loopback
PostgreSQL 17 database named `lythaus_auth_test_post_*`, provided through
`PLANETSCALE_PG17_TEST_DATABASE_URL`. Apply the canonical migration baseline
and the fixture's synthetic proposals only to that disposable database, as in
`scripts/ci/validate-planetscale-postgres17.mjs`. Run each post suite against its
own fresh database cloned from that baseline. Local fixture overrides are test
inputs, never hosted Wrangler environments or production activation evidence.

Changing this source does not change deployed Workers or certify production
authentication, detection or publishing. Public publishing remains withheld
until the complete publishing pipeline is validated. The parent owns review,
serialized merges, release and any separate activation decision.
