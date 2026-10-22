# Feed redesign candidate — 22 October 2026

Base: `d9d50807dd36664cda61b137a25aba8f31017b6f`. Isolated branch:
`codex/feed-redesign-20261022`. Candidate only; merge is held for parent
cross-task reconciliation. No deployment, provider mutation or feature activation
was performed. Marketing homepage files are unchanged.

## Design and capability decisions

The owner reference `libfile_de9016b0e478819193a7bd61d05bf470` was recovered and
visually inspected. The implementation adopts its horizontal category navigation,
rounded main image and image/title/excerpt/action hierarchy while retaining
Lythaus Manrope typography and warm light/dark themes. No third-party content,
branding or serif identity was copied.

- Discovery, News, actual custom-feed names, Appeals and add-feed controls form
  a horizontally scrollable, keyboard-accessible rail. Feed pages also swipe.
  Existing 1/2/3 custom-feed limits, News access and appeal gates remain authoritative.
- Appeals opens the member's existing private appeal history. There is no
  invented public appeal feed. Guest routes explain their sign-in requirement.
- Genuine optional titles are preserved. Categories and generic fallback text
  no longer become fabricated headlines. Text-only posts need no image or title.
- Author names link to existing profiles. The current feed projection does not
  expose avatar URLs, so a neutral person icon remains. Badges are undecided;
  no trust, verification or membership badge was invented.
- Save, comments, copy-link sharing, details/history, sources, mute, reporting
  and eligible editing retain real supported paths. News publication IDs remain
  distinct from backing post IDs; unbacked publications expose no post mutations.

## Reaction contract reconciliation

The API supports a single per-member post reaction: `like`, `insightful` or
`support`. Useful maps explicitly to `insightful`; the first-use explanation
states that it evaluates the contribution. It replaces another existing reaction
under the current API's single-selection contract. Raw reactions do not deduct
author reputation or rewards. No reputation policy, ranking or score was added.

There is no separate story-emotion API or negative contribution-quality API.
The familiar negative/emoji controls therefore explain capability limits rather
than recording a destructive or fabricated signal. The negative sheet offers:
Not useful to me (unavailable), disagreement (existing comments), accuracy concern
(existing explicit report-reason flow), and reaction to events (emotion gap).
The reporting API accepts a reason code, not a new evidence-upload field.
No author is exempted from scrutiny based on reputation.

Confirmed Useful state is shared with the post-detail reaction bar. Pending and
uncertain writes survive card disposal within a session and clear on account
change. Bookmark/reaction/mute recovery reads the canonical current state before
allowing another write. Reports are not automatically replayed; account activity
is linked for review. This state is not a durable cross-restart mutation journal.

## Evidence and limits

Executed in the saved cloud environment, using Flutter 3.41.1 / Dart 3.11.
The release fixture entry point is `test/browser/feed_redesign_entry.dart`.
Synthetic authors, media and local API responses are explicitly fixtures.
Browser runs use Chromium/Playwright; no physical-device or real screen-reader
acceptance is claimed. Browser tooling was unavailable through the frontend
plugin, so the environment's installed Playwright was used.

Evidence directory: `/workspace/lythaus-feed-evidence/` (outside the repository).
It contains the reference, release-build log, test logs, browser runner/results,
and mobile/desktop light/dark, 200% text, empty/error/loading screenshots.
The final PR records the final executed counts and review outcome.

## Original forty-package ledger reconciliation

All **40 packages remain OPEN** in the
[original ledger](forty-package-acceptance-ledger-2026-10-22.md). This candidate
adds bounded source and synthetic execution evidence only:

| Package | Candidate contribution | Still required |
| --- | --- | --- |
| UX-01 | Truthful unavailable reaction channels and mutation states | Complete capability and deployed baseline |
| UX-02 | Feed rail, swipe, deep-link retention, search/history regression checks | Integrated exact-commit entitlement and live route matrix |
| UX-03 | Author identity links and honest avatar fallback | Avatar projection contract and complete profile journeys |
| UX-05 | Existing receipt/history and appeal-gate access retained | Full trust-reader acceptance matrix |
| UX-06/07 | Bookmark, mute, report paths; account-isolation regressions | Authorized provider integration and persistent recovery acceptance |
| UX-08 | Responsive themes, large text, keyboard/semantics checks | Full contrast audit, real screen readers and physical devices |
| UX-09 | No reputation/reward policy change; emotion/quality gap documented | Separate policy and rewards acceptance |
| SEC/PUB/ADM | Existing gates and tests retained | All original package criteria remain open |

Integration must reconcile image PR1074 and wordmark PR1075 separately; neither
was cherry-picked. Default-disabled media gates remain disabled. Production
remains the parent-reported release128 / `3880a8be`; schema0021 is not applied,
and restore/billing evidence remains blocked. Canonical release gates still
apply to any eventual exact-commit deployment.

## Parent-authorized main integration

After the saved environment recovered, current main `e0a8eb52e3ec58719007ba8651e1e5d5bc24232d`
(merged image PR1074) was merged into this isolated branch without conflicts.
Every path changed by the image merge is byte-identical to main in the resulting
candidate; no image recovery implementation was overwritten. Wordmark and other
parent lanes remain separate. The PR records the resulting exact candidate and
integration-check outcomes. Earlier test/render records remain identified by
their original source; they are not silently promoted to integrated evidence.
