# UI delivery and cached app recovery

On 28 September 2026, PR #872 merged as
`f4ed584f719b5ef94cada60622c80fe4440f5c61`. Exact CI `36464559293` passed 2,717
Flutter tests (five opt-in skips), 87.10% coverage, website checks and release build.
CodeQL, dependency review, secret scanning and historical reconciliation passed for
that same revision. App deployment `36464749824` and its authenticated smoke passed.

The public app then served the validated bundle, SHA-256
`13e06e411488b5292065f90bbecdae3dbfb9ee26995cd303c588660e0ab58d39`, from Pages
deployment `33880eb9-a12c-4bcf-ae4d-b221eacedd23`. A fresh browser displayed Rewards,
Settings and Help in the new sidebar. An existing browser still displayed the old
three-item rail after ordinary reload. Unversioned scripts had a four-hour browser
cache policy, so provider deployment alone did not establish successful delivery.

The follow-up release adds content-derived filenames for the bootstrap and main
scripts, referenced by the generated app document and Flutter build configuration.
Original files remain for compatibility; a page downloads only its versioned pair.
The app cache policy revalidates documents and assets using HTTP validators, including
deep links. This trades conditional requests for reliable updates without clearing
session storage, drafts or preferences. The marketing homepage uses another project
and does not consume this build script or these headers.

The regression test uses a real local HTTP server and browser cache, not intercepted
responses. It verifies that a browser holding cached unversioned scripts requests both
new content URLs after reload and retains its stored preference. Reproduction:

```sh
node --test scripts/tests/version-web-entrypoints.test.mjs
node scripts/tests/web-release-cache.browser.mjs
```

Support deployment `36464754418` stopped before publishing because the new Help page
was absent from the sitemap and the new noindex 404 canonical did not match its output
path. Both metadata errors are corrected, and the existing production output validator
now also runs in CI. The sitemap guard permits only the exact Help entry; every existing
URL and priority, homepage rendering input and screenshot baseline remains protected.

Final production verification must record the follow-up merged revision, deployments,
versioned live asset hashes, warm/fresh browser results and homepage comparison. This
document records the observed problem and implemented repair, not a claim that the
follow-up is already deployed or that all product acceptance dependencies are complete.
