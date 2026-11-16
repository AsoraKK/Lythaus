#!/usr/bin/env bash
# Owner terminal only. The three LOGIN creations are the only provider writes.
set -euo pipefail
set +x

command -v pscale >/dev/null || { echo 'Install the PlanetScale CLI and sign in as yourself first.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Python 3 is required for target checks.' >&2; exit 1; }
if ! { : </dev/tty >/dev/tty; } 2>/dev/null; then
  echo 'A private interactive terminal is required; do not run in Actions or a recorded session.' >&2
  exit 1
fi

# API reads are bounded to the exact existing new target. No SQL credential is used.
pscale api organizations/lythaus/databases/lythaus-new-core --format json |
python3 -I -c '
import json,sys
d=json.load(sys.stdin)
assert d.get("id")=="87dbkhprjh30" and d.get("name")=="lythaus-new-core", "Database identity mismatch"
assert d.get("kind")=="postgresql" and d.get("ready") is True and d.get("state")=="ready", "Database not ready"
assert d.get("deleted_at") is None, "Database is deleted"
r=d.get("region",{})
assert r.get("provider")=="AWS" and r.get("slug")=="eu-central" and r.get("location")=="Frankfurt", "Region mismatch"
'
pscale api organizations/lythaus/databases/lythaus-new-core/branches/main --format json |
python3 -I -c '
import json,sys
d=json.load(sys.stdin)
assert d.get("id")=="xwkb9quljkzd" and d.get("name")=="main", "Branch identity mismatch"
assert d.get("kind")=="postgresql" and d.get("ready") is True and d.get("state")=="ready", "Branch not ready"
assert "deleted_at" in d and d["deleted_at"] is None, "Branch is deleted or unverified"
assert d.get("database_id","87dbkhprjh30")=="87dbkhprjh30", "Branch database mismatch"
assert d.get("cluster_name")=="PS_5_AWS_ARM" and d.get("replicas")==0, "Cluster profile changed"
'

check_inventory() {
  local expected_count="$1"
  pscale api organizations/lythaus/databases/lythaus-new-core/branches/main/roles --format json |
  python3 -I -c '
import hashlib,json,sys
d=json.load(sys.stdin); rows=d.get("data"); expected=int(sys.argv[1])
assert isinstance(rows,list) and d.get("current_page")==1 and d.get("next_page","missing") is None, "Role inventory incomplete"
assert d.get("total_count")==expected and len(rows)==expected, "Existing or partial role state; stop for reconciliation"
preserved="53b6a1e60ecb50cb1441d8d70a23882f6080ad81dd3561861d4507543a94ebf6"
assert sum(hashlib.sha256(r.get("id","").encode()).hexdigest()==preserved for r in rows)==1, "Original role identity mismatch"
if expected==1:
    assert (rows[0].get("name") or rows[0].get("label")) not in {"lythaus_migrations","lythaus_admin","lythaus_verifier","lythaus_runtime","lythaus_jobs","lythaus_privacy"}, "Existing scoped label; stop"
    assert rows[0].get("ready") is True and rows[0].get("deleted_at") is None, "Original role state mismatch"
else:
    labels={"lythaus_migrations","lythaus_admin","lythaus_verifier"}
    scoped=[r for r in rows if (r.get("name") or r.get("label")) in labels]
    assert len(scoped)==3 and {r.get("name") or r.get("label") for r in scoped}==labels, "Scoped roles missing or duplicated"
    assert len({r.get("base_username") for r in scoped})==3, "Scoped SQL identifiers not distinct"
    for r in scoped:
        assert r.get("inherited_roles")==[] and r.get("expires_at","missing") is None, "Scoped role privilege/expiry mismatch"
        assert r.get("branch",{}).get("id")=="xwkb9quljkzd" and r.get("database_name")=="postgres", "Scoped target mismatch"
        assert r.get("ready") is True and r.get("deleted_at","missing") is None, "Scoped role not ready"
        assert r.get("username")==str(r.get("base_username"))+".xwkb9quljkzd", "Scoped username mismatch"
' "$expected_count"
}

check_inventory 1
printf '%s\n' 'Verified lythaus/lythaus-new-core/main. Creating only the three approved managed logins.' >/dev/tty

for role_label in lythaus_migrations lythaus_admin lythaus_verifier; do
  if ! pscale role create lythaus-new-core main "$role_label" --org lythaus \
    --inherited-roles '' --with-replication=false --ttl 0s --format human >/dev/tty; then
    printf '%s\n' 'STOP: creation outcome may be uncertain. Do not rerun, duplicate or reset a role; reconcile it first.' >&2
    exit 1
  fi
  printf 'Save the %s password and username in your private password manager. Type SAVED to continue: ' "$role_label" >/dev/tty
  IFS= read -r saved_answer </dev/tty
  if [[ "$saved_answer" != SAVED ]]; then
    printf '%s\n' 'Stopped. Preserve the role and saved credential; do not rerun the batch.' >&2
    exit 1
  fi
done

if ! check_inventory 4; then
  printf '%s\n' 'Roles may exist and credentials are saved. Verification failed; do not rerun, reset or delete anything.' >&2
  exit 1
fi
printf '%s\n' 'Verified three scoped managed logins plus the preserved original role. No SQL, grants, schemas or deployment ran.' >/dev/tty
