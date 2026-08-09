# Lythaus-owned camera dataset

This runbook defines a future human-controlled collection process. It does not
collect images automatically and does not require precise GPS.

## Capture record

Each contribution must provide:

`capture_id`, `camera/device`, `camera model`, `OS/version if available`,
`capture mode`, `resolution`, `HDR/night mode status if known`, `date`, broad
environment class, original SHA-256, editing history, and `rights_release_id`.

Do not retain precise GPS, device serial numbers, account identifiers, or
unnecessary owner metadata. Preserve a restricted research original only when
the release and security policy justify it; create a privacy-safe derived
representation for routine feature extraction.

## Contributor workflow

1. Human owner approves the contributor and release template.
2. Contributor captures original files directly from the device.
3. A local intake tool records hashes and metadata before editing.
4. Contributor signs or accepts a release that covers training, modification,
   distillation, evaluation, commercial deployment, and API use.
5. A reviewer checks consent, privacy flags, metadata minimisation, and release
   scope.
6. Only approved records receive `CLASS_C_LYTHAUS_OWNED` with conditional or
   allowed gates; otherwise they remain `DO_NOT_TRAIN`.

No capture is accepted from normal Lythaus user uploads, and no person is
contacted or enrolled automatically.
