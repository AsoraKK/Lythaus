# WP004A Judge prompt contract v2

The previous HTTP-200 Chat Completions result parsed successfully but failed
`PRIMARY_HYPOTHESIS_INVALID`. The leading diagnosis is
`JUDGE_PROMPT_ENUM_CONTRACT_UNDERSPECIFIED`: prompt v1 did not enumerate the
canonical hypotheses. The rejected provider token was not retained.

`lythaus-gpt-oss-judge-prompt-v2` explicitly defines the existing hypothesis,
uncertainty and additional-test vocabularies, reference structures, and a valid
output example. The example is syntax guidance, not an expected answer.
Alternative duplication remains permitted by the unchanged parser; the prompt
prefers genuinely competing alternatives. PARTIAL packets and unavailable EF3/EF5
remain epistemically neutral limitations. Observer statements remain fallible,
safety remains context only, and camera/synthetic evidence stays independent.

The result/recommendation/Evidence Packet schemas, Chat Completions extraction,
strict canonical validation and provider request settings are unchanged:
messages, json_object, temperature 0, max_tokens 1200, non-streaming.

Optional invalid-primary telemetry retains only a token matching
`^[A-Z][A-Z0-9_]{0,63}$`, only on PRIMARY_HYPOTHESIS_INVALID. It is diagnostics,
never canonical evidence. No raw answer or reasoning is retained.

After protected merge, one separately authorized 0D confirmation may use at most
one moderation, one DIRECT Observer and one Judge call, zero retries. No 0D-R,
deployment, enforcement or Observer benchmark changes are included.

## Pre-live orchestration audit

Software-only failure injection established that required decode/extractor or
Observer failures could still reach the Judge: a FAILED packet is structurally
valid. The runner now stops downstream provider calls on these failures,
preserves the failed packet and available EF1 evidence for diagnosis, and exits
nonzero. A failed reasoned recheck likewise cannot trigger another Judge pass.
This is an execution guard, not a change to the evidence ontology or provider
prompt. Healthy PARTIAL packets with unavailable EF3/EF5 still reach the Judge.
