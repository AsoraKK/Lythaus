# Password hashing ADR

Status: implementation-ready; production benchmark evidence required before
any fallback is enabled.

The native API uses Argon2id with `m=19456 KiB`, `t=2`, `p=1`, a unique
16-byte salt, and a versioned Worker Secret pepper. The implementation uses
`@noble/hashes` and stores the algorithm and profile version with each hash.

Scrypt (`N=2^14`, `r=8`, `p=5`) is an explicit compatibility fallback only. It
is enabled when `PASSWORD_HASH_ALLOW_SCRYPT_FALLBACK=true`; production defaults
to `false`. A production change to `true` requires benchmark evidence showing
that the Argon2id profile cannot meet Worker CPU/memory limits, an approved
parameter decision, and a rehash-on-login plan.

This setting is deliberately fail-closed: an Argon2id failure in production
must surface as an authentication configuration error instead of silently
downgrading password storage.

New passwords (registration, credential setup, reset) are checked on submission
against the maintained Pwned Passwords range corpus. Only the first five SHA-1
hex characters leave the Worker, with `Add-Padding: true`; neither raw passwords,
full digests nor email addresses are sent. SHA-1 here is a corpus lookup, never
password storage. There are no incremental keystroke queries, credentials,
subscriptions, stored results or password-screening logs. The request and body
are bounded to five seconds and 256 KiB. Unavailable/invalid screening fails
closed for creating a password without consuming its recovery token. Existing
password sign-in and safe rehash do not depend on this service or the new-password
minimum. See https://haveibeenpwned.com/API/v3#PwnedPasswords.

Passwords are not trimmed or normalized. Version 1 retains the original UTF-8
interpretation and hashing profiles above, including historical 12–14-character
passwords. Changing interpretation or cost parameters requires a new recorded
version and a reviewed compatibility plan, not an in-place policy constant edit.

Run `node scripts/benchmarks/auth-password-workerd.mjs` for a local, network-denied
workerd compatibility benchmark using synthetic input. On 29 September 2026,
three local runs of one hash plus two verifications took 2151 ms cold and
911/910 ms warm, with the approved Argon2id profile and correct/wrong-password
checks passing. These are local wall times, not Cloudflare CPU/memory entitlement
evidence. The protected candidate benchmark remains required before production
certification; no cost reduction or fallback was enabled from these results.
