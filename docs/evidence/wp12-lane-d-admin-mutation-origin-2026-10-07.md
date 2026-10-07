# WP12 Lane D: Admin request admission verification

Base: `9e9ddc16e7399fd545f942524b3bd8dfed83cef4`.

The Admin dispatcher now consistently applies its existing same-origin JSON
request policy to legal-hold writes, editorial publication, moderation decisions,
appeal adjudication, both reviewer-qualification methods, account status and
subscription tier. Missing/untrusted origins return `403`; missing/non-JSON media
types return `415`. Legal-hold reads retain their existing behavior.

The change calls the existing policy before each handler and preserves its
authentication, roles, domain validation, audit and response handling. It adds no
global dispatcher rule, configuration, provider resource, dependency, schema,
client or CI change. The operations runbook documents the request contract,
including the explicit JSON header for bodyless hold clearing.

Regression tests remain in the existing CORS policy test file already executed
by native CI. They invoke the Admin dispatcher with synthetic Access/database
fixtures, checking all nine method/route pairs for missing, opaque, external,
sibling and suffix-spoofed origins, absent CORS configuration, and missing,
plain-text, form-urlencoded and multipart media types. Rejection must precede
body reads and domain work, including when otherwise valid payloads are supplied.

Positive cases retain same-origin JSON/case/charset admission, each handler's
validation, authentication/membership/rate and role denial, bodyless hold clearing,
legal-hold GET, cache policy and preflight behavior. A separate local workerd
test executes the production guard itself. It does not execute the entire
dispatcher, real Access verification, or database transactions. No live provider
request or mutation is part of these tests.

The PR review packet records the exact committed head and final test counts.
The bounded 44-module critical coverage manifest and thresholds are unchanged;
no historical repository-wide coverage percentage is asserted as current.

Independent review, required hosted checks, parent-owned sequential integration
and normal release/acceptance gates remain required. Rollback is an ordinary
reviewed revert and deployment through the normal process, with no data or
configuration rollback. No issue closure or deployment is performed by this PR.
