# Controlled Alpha Staged Rollout

Status: Canonical
Owner: Kyle

| Stage | Cohort | Expected duration | Review focus |
| --- | ---: | --- | --- |
| `technical_alpha` | 25–50 trusted users | 1–2 weeks | Auth, feeds, posting, labels, moderation, DSR, telemetry, support |
| `controlled_alpha` | Up to 100 users | About 2 weeks | Retention, moderation load, feed quality, appeals, stability |
| `expanded_alpha` | Up to 250 users | 2–4 weeks | Broader validation after prior exit criteria pass |
| `paused` | No expansion or new registration | Until Kyle review | Diagnostics and reversible remediation |
| `closed` | No new registration | Terminal for this Alpha window | Evidence retention and next-phase decision |

Every active stage requires recorded start, review, and end timestamps. The
cohort sizes above are manual operating targets, not proven runtime
enforcement. Kyle or the delegated launch owner maintains the controlled-cohort
roster and pauses new access when a stage is paused or closed.

Expansion is never automatic. Metrics produce a review packet for Kyle; they
do not mutate configuration. Stage changes require a documented human launch
decision and reconciliation against the current admin audit stream. There is
no supported stage-configuration endpoint or invite-redemption runtime claim in
this rollout record.

Before expansion, the launch owner must verify the critical controls that are
actually deployed for the candidate: registration/access handling, post and
comment creation, reactions, media upload, authorship enforcement, custom
feeds, News Board, reputation, the independent trained-reviewer appeal
process, notifications, and emergency read-only mode. Any control without
current runtime and test evidence remains planned and blocks the associated
stage decision.

Initial stage recommendation remains `technical_alpha` only after all release gates pass. The current candidate is NO-GO; see the canonical packet.
