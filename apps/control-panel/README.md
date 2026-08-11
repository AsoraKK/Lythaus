# Lythaus Control Panel

Primary admin UI for beta operations.

Build command: npm ci && npm run build
Output folder: dist/
Note: Single-page app routing requires Pages redirect rules.

## Configuration

### API Base URL

By default, the control panel calls the existing native admin Worker directly at
`https://admin-api.lythaus.co/api/admin`.

Note: Live file uploads are not supported yet; use URL inputs or mock mode.

The Worker permits credentialed CORS only from the configured exact control-panel
origin. Browser requests include the Cloudflare Access session cookie; the Worker
then validates the Access assertion and the administrator membership before
dispatching an operation. No service token is stored in or injected by the Pages
application.

To override the API origin for a reviewed environment:
```bash
VITE_ADMIN_API_URL=https://admin-api.lythaus.co/api npm run build
```

The client normalises a direct `/api` base to the canonical `/api/admin` route family.

The Dashboard connection panel may store only a reviewed API URL override in
`localStorage`. It never stores an administrator credential. Cloudflare Access
remains a separate, required boundary on the admin API origin.
