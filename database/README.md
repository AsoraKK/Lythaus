# Lythaus database

PlanetScale PostgreSQL is the canonical datastore. Current schema, grants,
forward migrations, recovery checks, and verification queries live under
`planetscale/`.

Production changes must use the reviewed forward-migration workflow. Never edit
an applied migration checksum and never execute writes or DDL against `main`
without the repository's explicit production gates and human approval.
