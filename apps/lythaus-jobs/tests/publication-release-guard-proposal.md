# Proposal: release guard for owner-only pipeline testing

This is an impact proposal for parent allocation, not an activated flag, policy
change, deployment or implementation. The Jobs assessment is not a global
public-posting gate. No live resource, credential, grant or setting is changed.

## Publication authority inventory

| Authority | Actual code path and public effect |
| --- | --- |
| Manual moderation allow | `apps/lythaus-admin-api/src/index.ts`, `decideModeration`, `POST /api/admin/moderation/cases/:id/decision`: changes posts/comments to allowed, confirms the declaration, stamps post publication time and emits published outbox/activity records. |
| Historical appeal adjudication | Same file, `adjudicateAppeal`, `POST /api/admin/appeals/:id/adjudications`: a versioned reversal can restore posts/comments/profiles and stamp post publication time. Its historical policy version must remain unchanged. |
| Timed community appeal restoration | `packages/db/src/community-appeal-closure.ts`, `restoreChallengedContent`, reached by Jobs reconciliation: records a scoped override and can restore allowed posts/comments with publication time. The existing independent holds/fingerprint checks remain authoritative. |
| Editorial publication | Admin `publishEditorial`, `POST /api/admin/editorial/publications`: creates a published editorial record, including a record without a backing post. Public editorial feeds admit published records; this bypasses an ordinary-post-only guard. |
| Public projection/fanout | Public API discovery/custom/personal/editorial feeds, individual post/comments and public profile collections; Jobs published-event feed/reputation/notification consumers. These project existing authority and must not accidentally expose owner-test content or reward it. |
| Privileged direct SQL/migrations | Administrative writes can bypass application guards. They are outside this lane and remain forbidden in production without explicit approval. No application gate can certify arbitrary privileged SQL. |

Public API submit/revise starts under review with null publication time. Ordinary
Jobs stores queued review, not allow authority. Private alpha/beta return private
non-enforcing findings. Neither `AUTHENTICITY_ENFORCEMENT_ENABLED=false` nor the
return-only assessment gates the four mutation authorities above.

## Proposed coherent scope

Parent should allocate one shared, versioned publication-release contract to the
contracts/acceptance owner and apply it at every authority above. Proposed modes
are withheld, owner-test and public; selection and activation require explicit
owner review. Absent/invalid/unreviewed configuration must not grant public
publication. Use only existing configuration resources; do not create a new
paid resource, service binding or credential. A rollback must restore the same
reviewed gate version and configuration snapshot.

In owner-test mode, only a server-resolved UUIDv7 owner allowlist and explicitly
synthetic run identifiers may enter test submissions. The client cannot issue
test entitlement, publication authority or rewards. Owner-test content stays
author-private, with null public publication time, regardless of a completed
allow/reversal assessment. Records and feedback must say private test review
completed; existing published activity, public notifications, public outbox
events, Discovery fanout and earning/reputation effects must be suppressed.
The categorical disclosure and content limits still apply. Owner testing does
not bypass deletion, actor/revision binding, independent holds, appeal authority
or budget admission.

Admin allow, historical reversal and community restoration should consume that
same contract inside their mutation transaction. They retain their original
decision/appeal policy versions and fingerprints while public delivery remains
withheld. Parent/policy owners must settle the exact deferred-publication and
private-feedback representation before code is allocated; this lane does not
invent a new appeal state or retention rule. Editorial owner-test records must
remain unpublished, including postless entries.

The read/fanout boundary must also exclude owner-test objects independently of
allowed moderation state. A moderation-only or ordinary-post-only flag is
insufficient. Cover individual reads, comments/replies, profile collections,
all feeds, editorial records, caches, notifications and earning consumers so a
configuration error at one writer cannot expose or reward a synthetic test.
Public mode remains unavailable until complete pipeline acceptance is linked
to the exact source/configuration head and the owner explicitly authorizes it.

## Required executable acceptance before activation

- Exercise real admin allow/queue/block, historical reversal and timed
  community restoration under the same guard; verify historical versions and
  scoped fingerprints are preserved.
- Exercise postless editorial publication and owner-test post-backed records.
  Guest and unrelated registered users must receive no public projection.
- Exercise deleted/locked authors, revisions during review, hold conflicts,
  concurrent decisions, duplicates, retries/exhaustion and interrupted commits.
- Verify zero public publication events, public notifications, Discovery
  candidates, earning/reward effects and stale-cache exposure in owner-test mode.
- Test missing/invalid/stale gate configuration and rollback. Distinguish local
  synthetic acceptance, provider calibration, production authentication, release
  certification and owner activation; none implies another.

This proposal does not authorize live provider calls, real user content, public
pilots, schema/grant changes or any activation. Parent must allocate admin,
appeal, editorial, shared contract and read/fanout changes after impact review.
