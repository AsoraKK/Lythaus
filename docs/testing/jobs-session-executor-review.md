# Jobs session executor review packet

Base: main e838a8ec088f64d8e78b908c31cbb7e80829c86e (release118 reported by parent).
Scope: new protected executor/recovery, synthetic lifecycle tests, CI registration
and runbook. No native Worker implementation, secret configuration, SQL/grants,
provider resource, member UI, auth/session/email, policy, media or rewards edits.

## Source findings

- Older script upload inherits from latest, so it cannot bind preservation to the
  caller's expected source version. New executor uses the documented newer Worker
  API and inherits each binding from the exact original UUID. Source/config remain
  in memory, with only strict fingerprints and UUIDs persisted.
- Both Workers require a staged 0% version in the deployment for overrides to
  work. Simply uploading a flagged version is insufficient. Recovery restores
  originals, then deletes this run's diagnostic versions and verifies absence.
- finally cleanup does not cover runner loss. The baseline artifact is uploaded
  before mutation, and the separate completion-triggered workflow uses that
  original record plus provider run markers. Recovery cannot send the SQL request.
- The documented delete envelope has success without result. Adapter explicitly
  accepts that envelope but still requires a separate 404 before certification.
- Artifact SHA-256 output may be bare hex while the REST digest is sha256-prefixed.
  Comparison normalizes only exact 64-hex values. Hidden directory uploads are
  explicitly enabled for named sanitized files only.
- Existing production rollback and Public waitlist deployment lack the shared
  Worker concurrency group. The executor blocks on this known source defect;
  parent coordination must resolve it before dispatch. Neither shared workflow is
  edited here. Cloudflare offers no documented deployment compare-and-swap;
  external provider operators must be excluded during protected execution.
- Hosted hygiene identified the GitHub owner literal as a retired-name match.
  Repository identity now derives from the exact canonical URL already recognized
  by the existing scanner. The scanner and its allowlist are unchanged.

## Privacy and proof boundaries

Credentials enter only protected steps; no value lookup, new credential or secret
replacement is implemented. The fixed Cloudflare account/Workers, GitHub repository
and diagnostic URL cannot be selected by workflow inputs. No SQL string, DB URL,
role, application content or provider model output enters the executor. Unknown
secret-bearing bindings and unsupported version fields fail before mutation.

Recovery records contain exact source/executor SHA, original run/attempt, version
and deployment UUIDs, and combined configuration hashes. Outcomes contain only
fixed statuses, the existing sanitized SQL receipt and source/version provenance.
Errors discard provider bodies/stacks/headers and emit a finite diagnostic code
allowlist. Mock sentinel tests check persisted results for raw source/configuration,
provider secrets and content fields. An observed receipt may have prerequisitesMet
false; observation does not certify those prerequisites or grant publication.

## Validation and remaining review

The 54-test lifecycle suite is isolated: fake state/fetch adapters, no actual
Cloudflare or PlanetScale request. It includes missing/unknown snapshots, strict
inheritance, mismatch/races, partial uploads/deployments, lost acknowledgements,
redirect/body timeout/size/JSON failures, forged metadata, cancellation and runner
loss, restoration/deletion failures, original-only restoration and no recovery
probe. Workflow ordering, fixed scopes, protected main/run provenance, first
attempt/run-history tombstones, action pins and current source lock failure are
covered. Parent independently reviews source/privacy and exact required CI.

Required before execution: coordinated shared locks; merged/active protected
recovery; exact current Public/Jobs version/deployment UUIDs and reviewed tag;
existing token availability/API permission/capability; an external-mutation-free
window; parent-reviewed restoration ownership and interruption response. Actual
managed Jobs role/session evidence is still absent. SQL installation remains a
separate unapproved operation. Public publication stays withheld.

Local result counts and exact draft head are recorded in the PR and retained
workspace review evidence. No local/mock result is provider acceptance.
