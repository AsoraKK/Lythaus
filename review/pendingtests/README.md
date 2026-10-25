# Archived focused comment boundary tests

`comments-boundary-followup.postgres.mjs` is the exact test-only file used against detached `refs/review/1090` at `a10c3812`. It is archived here because its imports intentionally resolve relative to the PR test directory.

To reproduce from a fresh detached PR worktree, copy this file to `apps/lythaus-public-api/tests/comments-boundary-followup.postgres.mjs`, initialize a disposable loopback PostgreSQL 17 database with the repository's `scripts/ci/validate-planetscale-postgres17.mjs`, and run:

```sh
PLANETSCALE_PG17_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/lythaus_auth_test_comments?sslmode=disable' \
  node --experimental-strip-types --test \
  --test-name-pattern='pagination remains continuous beyond 25|inactive author root and replies' \
  apps/lythaus-public-api/tests/comments-boundary-followup.postgres.mjs
```

These cases use only synthetic rows and clean up their inserted users/posts/comments. The baseline schema validator applies the full manifest, including migration 0021; the separate 0021 test lane is not part of this regression run. No fixture or service should be pointed at provider data.
