# Upload and publication case matrix

Evidence status: `EXECUTED` means a named deterministic local test passed; `STATIC / NOT RUN` means source inspected without a matching executed case. Workerd baseline: 29/29 passed. The exact extra cancellation test added by ref 1087 was temporarily inserted and passed in a 30/30 run, then removed. See [upload-test-log.md](upload-test-log.md).

| ID | Preconditions | Action | Expected | Observed evidence | Status |
|---|---|---|---|---|---|
| UP-01 | Upload feature disabled; guest caller | Create session, upload bytes, finalise, query status | Disabled response; no media DB access | Workerd case “disabled routes expose feature_disabled…”, `standard-upload.workerd.mjs:148-172` | EXECUTED |
| UP-02 | Feature enabled; guest caller | Call upload routes | Authentication required before media access | Same route case, lines 148-172 | EXECUTED |
| UP-03 | Active owner; valid PNG/JPEG intent | Create session | Private session, bounded Worker URL, checksum and expiry; no R2 locator | Workerd case “upload URL is a session-checked Worker route…”, lines 220-260 | EXECUTED |
| UP-04 | Existing session belongs to another owner | PUT bytes | 409; no quarantine object | Workerd case lines 236-240 | EXECUTED |
| UP-05 | Request body exceeds reservation | PUT bytes | 413; no object | Workerd case lines 242-244 | EXECUTED |
| UP-06 | Content type differs from session | PUT bytes | 415; no object | Workerd case lines 245-247 | EXECUTED |
| UP-07 | Bytes fail checksum/signature validation | PUT bytes | 400; no object | Workerd case lines 247-250; integrity unit suite passed 7/7 | EXECUTED |
| UP-08 | Valid upload URL already reached terminal state | Replay PUT | 409; cannot recreate bytes | Workerd case lines 251-260 | EXECUTED |
| UP-09 | Pending session has verified bytes | Finalise once | Queued receipt; one outbox event; no public locator | Workerd case “owner finalization returns a private queued receipt…”, lines 415-439 | EXECUTED |
| UP-10 | Finalisation response may have been lost | Retry finalise | Same canonical receipt only when exactly one owner/source-bound event exists | Workerd case “retry receipts require one canonical owner and source-bound event”, lines 440-453 | EXECUTED |
| UP-11 | Owner status is pending/queued | Poll status | Private pending state; detector and publication remain unrun/disallowed | Workerd case “private status never turns integrity completion…”, lines 174-190 | EXECUTED |
| UP-12 | Internal session is approved after integrity processing | Poll status | Client sees `review`; processing complete, safety/authenticity not run, publication false | Same status case, lines 174-185 | EXECUTED |
| UP-13 | Session is missing, other-owner, inactive, deleted, invalid ID, or wrong purpose | Poll status | 404 with no ownership disclosure | Workerd case “status conceals missing, nonstandard…”, lines 192-205 | EXECUTED |
| UP-14 | Post body includes image URL, IDs, attachments, or image field | Create post | 415; no post/outbox writes | Workerd case “unsupported image-bearing post bodies…”, lines 206-218 | EXECUTED |
| UP-15 | Queued owner upload is expired | Jobs queue delivery | Expire and release reserved quota; skip processing | Workerd case “expired queue work releases quota and retries both private bucket deletions”, lines 516-528 | EXECUTED |
| UP-16 | Owner account becomes inactive/deleted before processing | Jobs queue delivery | Expire; do not transform or persist review evidence | Workerd case “deleted-account queue work is fenced…”, lines 529-540 | EXECUTED |
| UP-17 | Valid queued source; image checks unavailable | Process queue message | Persist review-only object/evidence; no publication; duplicate delivery has no repeated effects | Workerd case lines 593-612 | EXECUTED |
| UP-18 | Queue delivery repeats or arrives after terminal state | Process same event again | No second transform/evidence/ledger mutation; clean private artifacts | Workerd cases “processing remains private review…” and “already-expired session state…” | EXECUTED |
| UP-19 | Cancelled session has orphan derivative; first R2 delete fails | Queue delivery then retry | Retry deletion; no transform, object, evidence, ledger, or publication side effect | Ref 1087 test body temporarily added, passed as extra subtest, then removed; test log | EXECUTED (1087 test body) |
| UP-20 | Expired pending session; quarantine delete fails or marker commit is lost | Run janitor repeatedly | Reservation released once; quota remains charged for staged bytes until cleanup marker; retry converges | Workerd janitor cases “expired pending-session janitor…” and “cleanup failure and a lost marker…”, lines 357-414 | EXECUTED |
| UP-21 | Terminal session has unreferenced derivative | Run janitor; inject R2 deletion failure | Delete orphan derivative and quarantine before marker; retry on failure | Temporary Workerd case passed: terminal orphan deletion retried; no ledger mutation; see `followup-upload.md` | EXECUTED |
| UP-22 | User leaves composer or clears selection | Dispose/clear local state | Stop polling and clear local selection; no claim of remote deletion | Flutter media suite checks local clear and no-remote-deletion warning. New `review/upload_disposal_test.dart` passes: disposal cancels token, clears reload block, and no polling occurs after 30 simulated seconds | EXECUTED |
| UP-23 | Polling response remains pending | Foreground polling reaches limit or app backgrounds | Poll every 5s up to 24 automatic attempts; suspend while backgrounded; manual status retry remains available | `review/upload_disposal_test.dart`: default-interval fake-time check sees no poll at 4s, the next at 5s, 24 automatic resumes after initial upload, none after limit, and `upload()` manual retry reuses identical attempt; existing override test separately covers background suspension | EXECUTED |
| UP-24 | User selects a valid local image but does not upload | Close composer after clearing the selection, per existing UI guard | Selection remains device-local and is not submitted | `test/features/media/private_image_upload_test.dart`: valid local PNG selection makes no API or repository calls; close is blocked while selected, clearing releases the guard, close returns to the prior route, and both call counts remain zero | EXECUTED |

## Revision checks

| Ref | Inspected change | Upload/publication relevance | Result |
|---|---|---|---|
| 1086 `3cdddaa` | `apps/marketing-site/tests/homepage-protection.test.mjs` only | No runtime upload or publication behavior changed | Source diff inspected read-only; no upload defect surfaced |
| 1087 `9c73ac3` | One cancelled queue cleanup retry case in `packages/media/tests/standard-upload.workerd.mjs` | Covers failed private derivative deletion and retry convergence | Exact test body passed in the temporary 30/30 Workerd run; ref remained read-only |
