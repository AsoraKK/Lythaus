# TLS pinning rotation runbook

## Scope

MVP release traffic uses platform TLS validation for the public gateway hostname `api.lythaus.co`. Strict SPKI pinning is deliberately disabled until the Cloudflare certificate rotation and rollback lifecycle is proven with an exact mobile artifact.

There is no secondary backend hostname. Cloudflare preview hostnames are ephemeral and are not pinned into a shipped mobile build.

## Current MVP deviation

- `ENABLE_CERT_PINNING=false` is passed by the Android and iOS release workflows.
- No host pins are shipped in Flutter, Android, or iOS client configuration.
- The release gate rejects strict pinning without at least a current and backup pin.
- Previous development builds are unsupported; no installed-client compatibility window exists.

This deviation preserves availability while the gateway certificate lifecycle is unproven. It does not authorize a direct provider fallback.

## Future pinning enablement

After `api.lythaus.co` is bound to the reviewed Worker and its certificate is stable:

```bash
./scripts/extract-spki-pins.sh api.lythaus.co
CERT_INDEX=1 ./scripts/extract-spki-pins.sh api.lythaus.co
```

Record at least the current leaf and one independently valid backup/intermediate pin. Update together:

- `_prodMobileSecurity.tlsPins.spkiPinsBase64` in `lib/core/config/environment_config.dart`
- `api.lythaus.co` in `mobile-expected-pins.json`
- `api.lythaus.co` in `lib/core/security/cert_pinning_common.dart`

Then promote the production pin lifecycle from `disabled` to `live`, enable strict pinning deliberately, and run:

```bash
SPKI_GATE=true flutter test test/security/environment_spki_pin_test.dart
python3 scripts/verify_pins.py
```

Do not enable strict pinning with an empty list or only one tested pin.

## Rotation

1. Capture the current certificate chain and expiry for `api.lythaus.co`.
2. Add the replacement pin while retaining the currently valid pin.
3. Build and test the exact mobile artifact against the live gateway.
4. Release the overlapping pin set before the certificate changes.
5. Confirm adoption and successful TLS telemetry.
6. Remove the retired pin only after the old certificate can no longer be served and supported clients have the replacement.

## Emergency recovery

If certificate rotation causes pin failures:

1. Confirm the failure is limited to pin validation and not DNS/Worker routing.
2. Restore the previous Worker/certificate configuration when possible.
3. Do not bypass the gateway by shipping a retired or preview hostname.
4. Prepare an emergency mobile build containing the valid overlapping pin set.
5. Record certificate chain, affected versions, timestamps, and rollback outcome.

## Validation

- Production Flutter/web artifacts contain no retired-provider hostname.
- `api.lythaus.co` resolves to the reviewed Cloudflare gateway.
- At least two valid pins exist before lifecycle state `live`.
- Placeholder strings are absent.
- Pin reports and release SHA are attached to the release evidence.
