# Read-only Cloudflare billing diagnostic

This manual diagnostic tests the existing production `CLOUDFLARE_API_TOKEN`
against billing history for the registry-approved shared Cloudflare account.
It performs exactly one request:

`GET https://api.cloudflare.com/client/v4/accounts/{approved_account_id}/billing/history?page=1&per_page=20`

No subscriptions, invoice links, token verification, token management, database,
restore, grant, migration or deployment endpoints are called. There is no retry,
pagination, alternate credential or account input. Redirects fail closed. The
request times out after ten seconds and the response body is capped at 1 MiB.

## Output and limitations

The only provider-derived output is access outcome, recognized currency codes,
and at most three `{currency, amount}` entries from historical `type=charge`
items whose description mentions PlanetScale. Descriptions are inspected in
memory and never printed. The label records a description match, not verified
database attribution. Shared-account amounts must not be summed or treated as
unit prices, per-restore quotes or prospective all-inclusive costs.

Raw bodies, provider error text, identifiers, names, emails, descriptions, dates,
account identity and invoice/receipt URLs are neither logged nor saved. Only the
allowlisted JSON goes to the Actions log and step summary; no artifact is uploaded.
HTTP 401/403 returns `access=denied` without reading the response body. Other HTTP,
transport, timeout, redirect or response-contract failures return `access=unknown`.
A missing or invalid token binding returns `access=not_attempted` without a request.
Every outcome other than `success` fails the workflow. Empty evidence or absent
currency is unknown evidence, never proof of zero spend or free service.

The [official history API](https://developers.cloudflare.com/api/resources/billing/subresources/history/methods/list/)
supports Bearer tokens with Billing Read or Billing Write. A token name or a
successful token verification does not establish either permission. Its documented
fields do not certify tax amount/rate, tax inclusion, period attribution,
finalization, a database's current price or restore costs. Undocumented tax fields
and `amount_to_pay` are deliberately ignored; no tax is inferred by subtraction.
[Cloudflare's PlanetScale billing documentation](https://developers.cloudflare.com/hyperdrive/platform/pricing/)
states that PlanetScale usage appears each billing period as a dollar total at
standard PlanetScale pricing. Generic history cannot certify the US$1 restore
ceiling, authorize a restore, or prove launch readiness.

## Review and later execution

Recovery-lane status: proposed for engineering review. Opening a PR does not
authorize merge or diagnostic dispatch; both remain on hold pending parent review
and duplicate-action reconciliation. No billing access result has been obtained,
and the image implementation is outside this lane.

After parent review, integrate through the existing review/CI process. Recheck
remote main, open PRs and workflow runs immediately before the single dispatch.
The workflow must be on protected current `main`; provide its exact reviewed
40-character commit as the required `source_sha` input. The job checks the dispatch
SHA, checkout SHA and freshly fetched main SHA for equality before provider access.
Use the existing `production` environment and its current review rules. The only
required provider binding is existing `secrets.CLOUDFLARE_API_TOKEN`; the approved
account is fixed in source, so no account secret or new binding is needed.

Run `node --test scripts/tests/cloudflare-billing-diagnostic.test.mjs` locally
without provider credentials. These synthetic tests are also registered in CI
and run before the workflow's sole credential-bearing step. A later denied result
must be reported and stopped, without changing permissions, creating credentials,
retrying or attempting a different route. No diagnostic outcome authorizes any
database or provisioning action.
