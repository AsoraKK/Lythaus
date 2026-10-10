# Native Worker runtime reliability slice — 10 October 2026

Base: `origin/main` at `d3b52ccd43d71493549d01b81c494a2d1c9647b5`.

## Confirmed finding

The Jobs fallback email adapter called global `fetch` without a redirect policy.
The existing fallback unit test replaces `globalThis.fetch` with a function that
returns a canned `Response`, so it cannot exercise workerd's default redirect
handling.

Before the fix, the new native regression returned one synthetic 307 from the
configured provider endpoint. Actual workerd followed it to the synthetic
redirect target, forwarded the POST body containing the synthetic recipient and
verification proof, then treated the target's synthetic message ID as provider
acceptance. The regression failed with `redirectTargetCalls: 1`, both synthetic
values present, and `accepted: true`.

`transactional-email-runtime.ts` now sets `redirect: 'manual'`. A follow-up
matrix exposed a second failure boundary: the adapter parsed a 3xx response
body before rejecting the status, allowing its `E_RATE_LIMIT_EXCEEDED` code to
override the 3xx status and schedule a retry. The adapter now rejects every 3xx
before parsing its body and records `E_DELIVERY_ACCEPTANCE_UNKNOWN`. The native
matrix verifies 301, 302, 303, 307 and 308 are terminal `failed` outcomes with
no retry scheduled and no target call. Genuine 429 with
`E_RATE_LIMIT_EXCEEDED` and 503 with `E_INTERNAL_SERVER_ERROR` remain transient
and queued; permanent 4xx handling is unchanged.

## Runtime evidence and scope

The regression bundles the production `sendTransactionalEmail` adapter and runs
it inside Miniflare/workerd. All outbound requests are intercepted by
`outboundService`; only `.invalid` synthetic hosts and synthetic message values
are used. A small database import stub exists only to avoid bundling the unused
Jobs database implementation; the tested adapter does not access it.

Other inspected outbound paths already have native redirect coverage: Public
Turnstile and the acceptance coordinator reject redirects in
`scripts/tests/auth-provider-redirects.workerd.mjs`, and moderation rejects
redirects in `packages/authenticity/tests/openai-moderation.workerd.mjs`.
Admin private service-binding adapters have unit failure/timeout coverage; this
slice does not add a separate workerd invocation of the full Admin Worker.

## Verification

- Before the first repair: workerd followed the synthetic 307, forwarded the
  recipient and proof, and accepted the target response.
- Before the second repair: workerd did not call the redirect target, but a 301
  response with `E_RATE_LIMIT_EXCEEDED` was classified transient and queued.
- After both repairs: the redirect matrix passes all seven provider statuses;
  the broader focused workerd batch passes **9/9 test cases** across seven
  files. The pair registered in `test:native-architecture` is **2/2 cases**:
  the Jobs redirect matrix and moderation redirect test.
- Jobs transactional-email runtime and dispatch unit tests pass **23/23**.
- `npm run typecheck:native` passes.

No live provider, mailbox, account, database, credential, Cloudflare binding,
deployment, or release was contacted or changed. This slice does not establish
production provider configuration, deployed Worker behavior, real delivery,
owner acceptance, or that every Worker path is safe.
