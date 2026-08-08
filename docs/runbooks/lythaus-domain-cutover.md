# Lythaus domain and Pages cutover

## Current state

- `api.lythaus.co` targets the native public API Worker.
- `admin-api.lythaus.co` targets the native admin API Worker.
- The jobs Worker has no public application route.
- `admin.lythaus.co` is still attached to a Pages project with a retired project name.
- The repository name is Lythaus, but transfer from the personal-owner namespace to the approved Lythaus organisation remains an external blocker.

## Change gate

Do not create a replacement Pages project or change DNS, Access, custom domains, build variables, or Git integration until the operator records:

- exact new project name and source branch;
- build command and output directory;
- current and replacement deployment identifiers;
- fixed and usage-based cost impact;
- Access application and policy mapping;
- DNS/custom-domain change;
- rollback owner and rollback steps.

Stop if the provider requires a paid upgrade, creates a duplicate billable resource, or cannot preserve the existing protected preview and production deployment during verification.

## Approved cutover sequence

1. Capture the current Pages project settings, latest production deployment, custom domain, Access policy, and DNS record.
2. Create the approved `lythaus-` replacement project from the transferred `LythausHQ/Lythaus` repository.
3. Deploy the exact control-panel commit and verify asset integrity, SPA routing, Access enforcement, admin API calls, logout, and error states on the replacement preview domain.
4. Attach a temporary Lythaus test hostname only when explicitly approved.
5. Move `admin.lythaus.co` to the replacement project.
6. Reapply and verify the Access policy before considering the cutover successful.
7. Confirm the old project receives no production requests.
8. Delete the retired-name project only after the rollback window closes.
9. Record sanitized deployment, DNS, Access, and deletion evidence under `docs/history/`.

## Rollback

1. Reattach `admin.lythaus.co` to the captured prior Pages deployment.
2. Restore the captured DNS record and Access application mapping.
3. Verify authentication, SPA navigation, and admin API access.
4. Leave the replacement project isolated for investigation; do not delete either project during an active incident.
