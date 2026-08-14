# Lythaus Control Panel

Primary admin UI for beta operations.

Build command: npm ci && npm run build
Output folder: dist/
Note: Single-page app routing requires Pages redirect rules.

## Configuration

### API Routing

The control panel uses the same-origin `/api/admin` path. Cloudflare routes only
that path on `admin.lythaus.co` to the existing native admin Worker; the direct
`admin-api.lythaus.co` origin remains available for compatible administrative
service and incident tooling.

Note: Live file uploads are not supported yet; use URL inputs or mock mode.

Browser requests include the Cloudflare Access session cookie. The Worker then
validates the Access assertion and administrator membership before dispatching
an operation. No API override, service token or administrator credential is
stored in the Pages application.
