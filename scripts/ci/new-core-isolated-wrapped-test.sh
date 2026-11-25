#!/usr/bin/env bash
set -euo pipefail
[[ $# == 2 ]] || { echo 'Usage: new-core-isolated-wrapped-test.sh APP_CHECKOUT SEALED_ARTIFACTS' >&2; exit 2; }
source_dir=$(realpath -- "$1")
artifact_dir=$(realpath -- "$2")
runner=$(realpath -- "$(dirname -- "$0")/new-core-isolated-wrapped-test.mjs")
fixture=$(mktemp -d)
container=''
cleanup() {
  if [[ -s "$fixture/container.id" ]]; then
    IFS= read -r container < "$fixture/container.id" || true
    if [[ "$container" =~ ^[0-9a-f]{64}$ ]]; then docker rm -f "$container" >/dev/null; fi
  fi
  rm -rf -- "$fixture"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The application lock predates the managed PostgreSQL wrapped binding. This independent,
# Linux x64 rehearsal uses Cloudflare's published November runtime for the same Worker bytes.
url='https://registry.npmjs.org/@cloudflare/workerd-linux-64/-/workerd-linux-64-1.20261125.1.tgz'
cd "$fixture"
curl --disable --fail --silent --show-error --proto '=https' --tlsv1.2 --max-time 150 --output binary.tgz "$url"
echo '54cd5d3cc25506f80139cf4ef48fdded20c481000cfb557fb916a0ce51babace  binary.tgz' | sha256sum --check --status
tar -xOzf binary.tgz package/bin/workerd > workerd
echo '2fccdc776a7671f46c2676a7c19f30f948b0fb5d8747471b495fe985e97dafbc  workerd' | sha256sum --check --status
chmod 700 workerd
docker run --detach --rm --cidfile "$fixture/container.id" --label lythaus.purpose=isolated-wrapped-test \
  --env POSTGRES_PASSWORD=local_wrapped_fixture --publish '127.0.0.1::5432' \
  postgres:17@sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f >/dev/null
container=$(cat "$fixture/container.id")
[[ "$container" =~ ^[0-9a-f]{64}$ ]]
for ((i=0; i<30; i++)); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null
endpoint=$(docker port "$container" 5432/tcp)
[[ "$endpoint" =~ ^127\.0\.0\.1:[0-9]+$ ]]
(
  cd "$source_dir"
  env -i PATH="$PATH" HOME="$fixture" PLANETSCALE_PG17_TEST_DATABASE_URL="postgresql://postgres:local_wrapped_fixture@$endpoint/postgres" \
    node scripts/ci/validate-planetscale-postgres17.mjs >"$fixture/schema.log"
)
env -i PATH="$PATH" HOME="$fixture" node "$runner" "$source_dir" "$artifact_dir" "$endpoint"
