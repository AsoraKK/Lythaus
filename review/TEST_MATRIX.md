# New reliability matrix — 2026-10-25

## Current status after cached-tool follow-up

The initial accounting below is historical. Final lane matrix status: **66 directly exercised/passed, 1 qualified, 0 wholly unexecuted/source-only, 0 confirmed current-contract failures** across67 cases. Upload24/24; comments20/20 at pending UI/reader/documented transformed-API scope; integration22direct/1qualified. I-08 has actual browser reload evidence after durable persistence plus app-driven reload gating, but no documented promise to block forced manual reload before persistence. I-18 provider isolation and I-23 targeted semantics now executed. Exact row audit and command counts are in EVIDENCE_LEDGER.md. Three CS future-contract assertions fail intentionally against the staged legacy reader and are not product defects. Original outputs remain preserved.

## Historical initial accounting and additional seam definitions

The three lane files form one 67-case matrix, with preconditions, action, expected outcome, observed result and evidence on every row:
- [Upload/publication UP-01–UP-24](upload-matrix.md): 24 cases; 20 mapped to executed media assertions, 4 source-only/unexecuted.
- [Comments C01–C20](comments-matrix.md): 20 cases; source review of the pending contract, not full runtime execution. C01/C08 now additionally corroborated by CS02/CS01 below. Proposed fixtures must not be mistaken for checked-in handler behavior.
- [Integration I-01–I-23](integration-matrix.md): 23 cases; projection behavior tested, UI observations remain static.

This is not a claim that all 67 journeys ran end-to-end, and is not evidence of any historical suite completion. UI/backend combined rows explicitly separate Node execution from UI review. Additional executable coordinator cases below give 82 defined cases total (67 lane + 12 S + 3 CS); some intentionally corroborate lane findings, so do not interpret 82 as unique runtime coverage.

| ID | Preconditions | Action | Expected outcome | Observed result | Evidence |
|---|---|---|---|---|---|
| S01 | Synthetic post event serialized through JSON | Parse and compare canonical revision | Current revision accepted | Pass | seams.test.mjs / seams.tap |
| S02 | Synthetic comment with commentId | Parse; also try postId-only payload | Correct field accepted, wrong contract rejected | Pass | seams.tap |
| S03 | Canonical event replaced after edit | Process earlier sourceEventId | Stale revision rejected | Pass | seams.tap |
| S04 | Body changed after event created | Compare old hash | Stale body rejected | Pass | seams.tap |
| S05 | Creation mode changed | Compare old declaration | Stale declaration rejected | Pass | seams.tap |
| S06 | Deleted content before processing | Compare canonical deletion marker | Deleted content ineligible | Pass | seams.tap |
| S07 | Content already published | Replay review delivery | No current under-review state | Pass | seams.tap |
| S08 | Canonical content absent | Validate queued revision | Reject absent content | Pass | seams.tap |
| S09 | Content and media events | Route declared event names | Content→moderation, media→media | Pass at routing helper; not consumer execution | seams.tap |
| S10 | Workflow instance already exists | Repeat ordinary create | Accept duplicate idempotently | Pass | seams.tap |
| S11 | Workflow create loses connection | Throw local transient error | Error propagates for retry | Pass | seams.tap |
| S12 | Payload source differs from envelope ID | Parse event | Reject mismatch before persistence | Pass | seams.tap |
| CS01 | Exact a10c381 handler, empty synthetic page | Compare normal request with targetId request | Different target-scoped lookup | FAIL: identical SQL and args | comment-seam-expected.tap; observed mode corroborates |
| CS02 | Same real handler, conversation/newest requested | Compare with ordinary flat read | Conversation/sort changes lookup | FAIL: identical ascending flat query | comment-seam-expected.tap |
| CS03 | Same handler, conversation read | Inspect serialized response | Capabilities advertised for client contract | FAIL: capabilities absent | comment-seam-expected.tap |

Monthly routes also executed 15 existing cases (monthly-routes.tap) and seven projection tests passed. Those are supporting regressions, not invented additions to this matrix. Every source-only/unexecuted lane row remains unexecuted despite these passing unit checks.
