# Cloudflare retired-resource removal — 6 August 2026

The shared Lythaus Cloudflare account was inspected before mutation. No Lythaus zone route or scheduled trigger referenced the retired Workers.

| Resource | Type | Result |
| --- | --- | --- |
| `asora-feed-edge-development` | Worker | Deleted |
| `control-api-proxy` | Worker | Deleted |
| `feed-cache` | Worker | Deleted |
| `lythaus-api-gateway-preview` | Worker | Deleted |
| `Asora Control Panel API` | Access application | Deleted |
| `Asora Admin API` | Access application | Deleted |
| `Asora Control Panel` | Access application | Deleted |
| Former-team `App Launcher` | Access application | Deleted |
| `control.asora.co.za` | Pending Pages custom domain | Deleted |
| `preview-RATE_LIMIT_KV` | KV namespace | Deleted after verifying zero keys and zero remaining Worker bindings |
| Azure Communication Services DKIM selectors | DNS records | Deleted |
| Microsoft SPF for `mail.lythaus.co` | DNS record | Deleted |
| Microsoft domain-verification record | DNS record | Deleted |

The only remaining Lythaus backend Workers are:

- `lythaus-public-api-development`
- `lythaus-admin-api-development`
- `lythaus-jobs-development`

Unrelated Nite Owl resources were not changed.

## Approval-gated follow-up

The Pages project named `asora` still serves `admin.lythaus.co`, and its preview domain remains protected by the `Lythaus Control Panel Preview` Access application. Replacing it requires creating and deploying a new Pages project, cutting over DNS, and retaining a rollback path. No replacement was created without explicit resource and cost approval.

Cloudflare Email Sending has no configured sending subdomain. Email authentication is not launch-ready until `mail.lythaus.co` is onboarded, the required DNS records are installed, a cost ceiling is authorised, and end-to-end delivery acceptance passes.
