#!/usr/bin/env bash
set -euo pipefail
if (( $# != 2 )); then
  echo 'Usage: bash new-core-isolated-pg-test.sh APP_CHECKOUT SEALED_ARTIFACTS' >&2
  exit 2
fi
app_dir=$(realpath -- "$1")
artifacts_dir=$(realpath -- "$2")
runtime_test=$(realpath -- "$(dirname -- "$0")/new-core-isolated-runtime-test.mjs")
fixture_dir=$(mktemp -d)
fixture_container=''
cleanup() {
  if [[ -s "$fixture_dir/container.id" ]]; then
    IFS= read -r fixture_container < "$fixture_dir/container.id" || true
    if [[ "$fixture_container" =~ ^[0-9a-f]{64}$ ]]; then
      docker rm --force "$fixture_container" > /dev/null
    fi
  fi
  rm -rf -- "$fixture_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker run --detach --rm --cidfile "$fixture_dir/container.id" \
  --label lythaus.purpose=isolated-runtime-test \
  --env POSTGRES_PASSWORD=disposable_fixture_only \
  --publish '127.0.0.1::5432' postgres:17@sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f >/dev/null
IFS= read -r fixture_container < "$fixture_dir/container.id" || true
endpoint=$(docker port "$fixture_container" 5432/tcp)
[[ "$endpoint" =~ ^127\.0\.0\.1:([0-9]+)$ ]]
for ((i=0; i<30; i++)); do
  if docker exec "$fixture_container" pg_isready -h 127.0.0.1 -U postgres -d postgres >/dev/null; then
    break
  fi
  sleep 1
done
docker exec "$fixture_container" pg_isready -h 127.0.0.1 -U postgres -d postgres >/dev/null
(
  cd "$app_dir"
  env -i PATH="$PATH" HOME="$fixture_dir" \
    PLANETSCALE_PG17_TEST_DATABASE_URL="postgresql://postgres:disposable_fixture_only@$endpoint/postgres?sslmode=disable" \
    node scripts/ci/validate-planetscale-postgres17.mjs >"$fixture_dir/migration.log"
)
docker exec "$fixture_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "ALTER ROLE lythaus_admin LOGIN PASSWORD 'disposable_role_only'" > /dev/null
(
  cd "$fixture_dir"
  env -i PATH="$PATH" HOME="$fixture_dir" CI=true WRANGLER_SEND_METRICS=false \
    LOCAL_SCOPED_PG_FIXTURE="postgresql://lythaus_admin:disposable_role_only@$endpoint/postgres" \
    node "$runtime_test" "$app_dir" "$artifacts_dir" --local-pg
)
postconditions=$(docker exec "$fixture_container" psql -XAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  SELECT count(*) = 1 AND count(*) FILTER (WHERE m.active AND m.role = 'administrator' AND u.status = 'locked') = 1
    AND (SELECT enabled FROM system.feature_flags WHERE flag_key = 'identity.first_admin_bootstrap_consumed')
    AND (SELECT count(*) = 1 FROM system.audit_events WHERE action = 'identity.first_admin_bootstrapped')
    AND NOT EXISTS (SELECT 1 FROM identity.email_credentials)
    AND NOT EXISTS (SELECT 1 FROM identity.provider_links)
  FROM identity.admin_memberships AS m JOIN identity.users AS u ON u.id = m.user_id")
[[ "$postconditions" == 't' ]]
echo 'Local PostgreSQL postconditions verified.'
