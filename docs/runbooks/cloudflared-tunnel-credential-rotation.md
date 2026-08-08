# Cloudflared tunnel credential rotation

## Current state

On 2026-08-05 the secret for tunnel `asora-control` (`dec1161f-8cc0-4c57-8d5a-1286ab45f633`) was rotated through the Cloudflare API and all existing tunnel connections were cleared. The tunnel remains remote-managed with a `http_status:404` catch-all. No Lythaus repository route or deployment currently proves that this tunnel is required.

The Windows `Cloudflared` service still reports `Running`, `Automatic`, and `LocalSystem`. The current shell could not open the service for control, so the old service command may still contain the now-invalid token. This is a local administrator follow-up, not evidence that the old credential remains valid.

## Local administrator handoff

Run the following checks from an elevated PowerShell session. Do not paste a token into the repository, an issue, a log, or a chat message.

```powershell
Get-CimInstance Win32_Service -Filter "Name='Cloudflared'" |
  Select-Object Name,State,StartMode,StartName,PathName

Stop-Service -Name Cloudflared
Set-Service -Name Cloudflared -StartupType Disabled
```

If the tunnel is required, install the newly issued token through the Cloudflare-supported service installer or an equivalent protected credential mechanism, then use a dedicated least-privilege service identity where supported. Confirm that the service command and configuration are readable only by the service account and administrators. Start the service only after its purpose, ingress, and owner are recorded.

If the tunnel is not required, leave the service disabled and obtain explicit ownership confirmation before deleting the tunnel. After deletion, verify that the tunnel has no connections and that no Lythaus workflow depends on it.

## Exit evidence

- The pre-rotation token is rejected.
- The service is disabled or uses the rotated credential through protected storage.
- The service identity is least privilege and its owner is documented.
- Ingress contains only approved routes and ends with `http_status:404`.
- The tunnel is retained only if a confirmed Lythaus use exists.

Never record token values in evidence. Use the redacted status record at `docs/evidence/production-cutover/2026-08-05-tunnel-rotation.json`.
