#!/usr/bin/env bash
set -euo pipefail
if (( $# < 2 || $# > 3 )) || [[ "${3:-}" != '' && "${3:-}" != '--repair' && "${3:-}" != '--binding-fix' ]]; then
  echo 'Usage: bash new-core-isolated-pg-test.sh APP_CHECKOUT SEALED_ARTIFACTS [--repair|--binding-fix]' >&2
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
fixture_password='disposable_role_only'
if [[ "${3:-}" == '--binding-fix' ]]; then
  # Exercise literal URI delimiters and a literal percent-encoded-looking value in the native binding fields.
  fixture_password='disposable/role#%23?@only'
  umask 077
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=Disposable Loopback CA' \
    -keyout "$fixture_dir/ca.key" -out "$fixture_dir/ca.crt" >/dev/null 2>&1
  openssl req -new -newkey rsa:2048 -nodes -subj '/CN=localhost' \
    -keyout "$fixture_dir/server.key" -out "$fixture_dir/server.csr" >/dev/null 2>&1
  echo 'subjectAltName=IP:127.0.0.1,DNS:localhost' > "$fixture_dir/subject-alt-name"
  openssl x509 -req -in "$fixture_dir/server.csr" -CA "$fixture_dir/ca.crt" -CAkey "$fixture_dir/ca.key" \
    -CAcreateserial -days 1 -extfile "$fixture_dir/subject-alt-name" -out "$fixture_dir/server.crt" >/dev/null 2>&1
  docker cp "$fixture_dir/server.key" "$fixture_container:/var/lib/postgresql/data/server.key"
  docker cp "$fixture_dir/server.crt" "$fixture_container:/var/lib/postgresql/data/server.crt"
  docker exec "$fixture_container" bash -ceu '
    cd "$PGDATA"
    chown postgres:postgres server.key server.crt
    chmod 600 server.key
    sed -i "1i hostnossl all lythaus_admin all reject" pg_hba.conf
    echo "ssl = on" >> postgresql.conf
  '
  docker exec "$fixture_container" psql -XAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT pg_reload_conf()' >/dev/null
  for ((i=0; i<30; i++)); do
    if [[ "$(docker exec "$fixture_container" psql -XAt -U postgres -d postgres -c 'SHOW ssl')" == 'on' ]]; then break; fi
    sleep 1
  done
  [[ "$(docker exec "$fixture_container" psql -XAt -U postgres -d postgres -c 'SHOW ssl')" == 'on' ]]
fi
docker exec -i "$fixture_container" psql -X -v ON_ERROR_STOP=1 -v role_password="$fixture_password" -U postgres -d postgres >/dev/null <<'SQL'
ALTER ROLE lythaus_admin LOGIN PASSWORD :'role_password';
SQL
fixture_password_uri=$(node -p 'encodeURIComponent(process.argv[1])' "$fixture_password")
run_runtime() (
  cd "$fixture_dir"
  env -i PATH="$PATH" HOME="$fixture_dir" CI=true WRANGLER_SEND_METRICS=false \
    LOCAL_SCOPED_PG_FIXTURE="postgresql://lythaus_admin:$fixture_password_uri@$endpoint/postgres" \
    node "$runtime_test" "$app_dir" "$artifacts_dir" --local-pg "$@"
)
if [[ -n "${3:-}" ]]; then
  docker exec "$fixture_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "REVOKE SELECT ON identity.admin_memberships FROM lythaus_admin" >/dev/null
  run_runtime "$3" --denied-membership-read
  docker exec "$fixture_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "GRANT SELECT ON identity.admin_memberships TO lythaus_admin" >/dev/null
  run_runtime "$3"
else
  run_runtime
fi
postconditions=$(docker exec "$fixture_container" psql -XAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  SELECT count(*) = 1 AND count(*) FILTER (WHERE m.active AND m.role = 'administrator' AND u.status = 'locked') = 1
    AND (SELECT enabled FROM system.feature_flags WHERE flag_key = 'identity.first_admin_bootstrap_consumed')
    AND (SELECT count(*) = 1 FROM system.audit_events WHERE action = 'identity.first_admin_bootstrapped')
    AND NOT EXISTS (SELECT 1 FROM identity.email_credentials)
    AND NOT EXISTS (SELECT 1 FROM identity.provider_links)
  FROM identity.admin_memberships AS m JOIN identity.users AS u ON u.id = m.user_id")
[[ "$postconditions" == 't' ]]
echo 'Local PostgreSQL postconditions verified.'
