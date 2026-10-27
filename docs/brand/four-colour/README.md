# Palette-matched brand exports

The consumer app and marketing site select derivatives of the approved artwork using the four-colour presentation contract: canvas `#242321`, surface `#302E2B`, reading text `#F5F3EE` and amber `#EFC58D`. Browser/PWA icons, native launcher icons and the active standalone social card retain amber artwork on canvas. Android's monochrome launcher layer uses the text token; the OS supplies its themed rendering.

The original package SHA-256 is `5e39cb394ce182f540a5434f8e14267a51b40977a05c1ed3816918d85ff22995`. The original `approved-v1/INTEGRATION-MANIFEST.json`, `SHA256SUMS.txt`, `import-map.json`, all imported files and native catalogs remain intact. The standalone social-card source remains at its original `78f698ef4283` fingerprint. [manifest.json](manifest.json) records each source path/hash, derived path/hash, selected web URL and legacy alias.

## Derivation

`scripts/derive-four-colour-brand.mjs` uses the repository-locked Sharp dependency. PNG pixels are recoloured at their original coordinates without resizing or resampling. A per-pixel projection recovers the original ink/amber coverage and maps it to canvas/amber; original raster edge overshoot is clamped to the palette endpoints. Transparency and the presence or absence of an alpha channel remain unchanged, including opaque Apple icons. Tests bound coverage differences to colour-quantization precision. Transparent two-tone fixtures ensure that alpha never causes the background to collapse into the foreground colour.

SVG and Android vector exports replace colour attributes only. Paths, transforms, viewBoxes and dimensions remain byte-identical. Every ICO frame retains its resolution, palette-count byte, planes and bit depth; only PNG payloads, lengths and offsets change. New Apple catalogs preserve every original size, scale, idiom and filename declaration.

Native selections use `AppIconFourColour` catalogs, `ic_launcher_four_colour` Android resources, and `app_icon_four_colour.ico` on Windows. Android adaptive foreground and monochrome geometry is unchanged, with the shared canvas background. No native resource is replaced in place.

Web selections use new content-fingerprinted paths under `icons/lythaus-four-colour/` and `brand/lythaus-four-colour/`. Exact 302 redirects map existing stable icon aliases to the new fingerprints; original alias files and original fingerprinted URLs remain intact. Existing SPA and invitation rules retain their order after these exact icon rules. New fingerprint namespaces receive the same immutable caching policy; authentication and security headers remain unchanged. Control-panel assets and references remain outside this derivation's selected scope.

## Verification

Run from the repository root:

```sh
node scripts/derive-four-colour-brand.mjs --check
node --test scripts/tests/approved-brand-assets.test.mjs scripts/tests/version-web-entrypoints.test.mjs
npm run marketing:test
npm run build --prefix apps/marketing-site
npm run marketing:validate
```

The existing brand-asset test entry point includes deterministic export, original-source integrity, palette, alpha/coverage, vector geometry, ICO container, native selection and exact-alias tests. Blank, displaced, off-palette and partially transparent negative fixtures exercise the verification itself. Marketing browser checks follow the active icon/social references and compatibility redirects, while preserving the opening and static-fallback checks.

Source/catalog/container verification and rendered export inspection do not establish native compilation or device rendering. Android, iOS, macOS and Windows packaging still require their native toolchains before release. Browser engine coverage and exact-head hosted CI must be reported separately. This change performs no deployment and changes no business, authentication, provider or release-gate behavior.
