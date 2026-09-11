# WP004A Relational Geometry A/B

This is a research-only Observer experiment. It tests whether Moondream's
`reasoning: true` mode improves one controlled visual relationship over the
same model with `reasoning: false`. It does not test authenticity detection,
does not involve GPT-OSS, and grants no enforcement authority.

## Fixture

`WP004A_GEOMETRY_OCCLUSION_01` is a deterministic 512x512 RGB PNG rendered
locally from SVG through Sharp. A red rectangle is drawn first, a blue
rectangle is drawn over it, and a separate green circle is drawn as a control.
The reviewed coordinates, draw order, generator version, and SHA-256 are in
`research/wp004a/geometry-occlusion-fixture-v1.json`. The PNG is generated at
runtime and is not committed.

The truth envelope is evaluator-only. It is never included in the Observer
request, runtime manifest, prompt, Evidence Packet, or provider payload.

## Trial

`0C-REL-AB` makes exactly two bounded Moondream query calls using the same
fixture bytes, hash, category, question, prompt v2, protocol v1, model, and
generation controls (`temperature: 0`, `max_tokens: 1200`, `stream: false`).
Only `reasoning` differs:

- DIRECT: `reasoning: false`
- REASONED: `reasoning: true`

No moderation, caption, detect, point, Judge, retry, or recursive follow-up is
allowed. Raw provider reasoning remains excluded from normalized observations
and all sanitized output.

## Evaluation

The deterministic evaluator scores only normalized Observer output. It records
occlusion identification, front/back correctness, geometry consistency, the
control object's false relation, unsupported origin assertions, protocol
validity, and `INDETERMINATE`/review states. Ambiguous wording becomes
`REQUIRES_REVIEW`; it is not guessed into a pass or fail.

One fixture cannot establish a general reasoning result. Follow-up relational
fixtures should cover reflection, lighting/shadow, and screen/display
relationships before GPT-OSS is introduced.
