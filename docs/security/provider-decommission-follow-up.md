# Provider decommission follow-up

This checklist separates repository decommissioning from live provider
changes. No action in this document was executed by the repository PR.

| Surface | Current state and evidence | Desired Lythaus state | Exact proposed mutation | Rollback | Approval | Status |
| --- | --- | --- | --- | --- | --- | --- |
| GitHub owner namespace | Repository is `AsoraKK/Lythaus`; owner decision is to keep the personal namespace | Lythaus repository remains under `AsoraKK` with no product branding in active metadata | No mutation; retain owner and repository name `Lythaus` | None required | None | Accepted decision |
| Former-brand Pages project | A legacy Pages project still serves `admin.lythaus.co`; `lythaus-web` is the current Lythaus Pages project | Only the Lythaus Pages project serves active Lythaus domains | Verify replacement routes, rebind `admin.lythaus.co`, then retire the legacy project only after production smoke and DNS checks | Restore the prior Pages binding/DNS records and previous deployment | Cloudflare owner and release owner | Pending |
| Email delivery | Native Worker configuration uses the Cloudflare email binding, but provider onboarding and delivery acceptance are not yet proven | Verified Lythaus sending domain, DNS authentication, delivery telemetry, and protected secrets | Onboard the approved Lythaus sending domain, publish required DNS records, verify delivery, and enable the production binding | Disable the new sender and restore the previously approved delivery mode without exposing credentials | Cloudflare/email owner | Pending |
| PlanetScale production | `main` remains at the approved baseline; forward migrations through `0011` pass local PostgreSQL 17 validation but were not applied here | Production schema reconciled to the approved forward migration set | Run the reviewed production migration script only after exact baseline, data classification, cost, and approval gates pass | Use forward corrective migrations or the documented restore procedure; never rewrite checksums | PlanetScale/data owner | Pending |
| Retired GitHub credentials | Azure-pattern counters are verified zero; several non-Azure names lack a tracked consumer | Zero retired credentials and purpose-documented retained credentials | Separately delete only names proven retired or owner-approved as unneeded; rotate rather than record values | Restore through provider-controlled rotation only; never recover values from Git history | Repository owner | Verified/owner review pending |
| Store submission | Store and signing checklist still contains owner-controlled evidence items | Verified Android/iOS metadata, signing, privacy, and release evidence | Complete provider-console evidence and release gates; no repository secret values or screenshots | Withdraw staged release and restore prior release metadata | Product/release owner | Pending |

## PR boundary

This PR performs no Cloudflare resource, DNS, Email Sending, PlanetScale
production, store-console, GitHub-owner, or unverified credential mutation.
