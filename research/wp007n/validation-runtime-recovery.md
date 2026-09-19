# Validation dependency-link recovery

The first complete regression receipt is preserved in commit `0fb91887`. A later rerun found that root dependency junctions in both N and the unchanged M baseline were absent. The shared locked L dependency installation still existed. No evidence identifies what removed the links; no cause is attributed to the owner or another process.

The failed rerun produced 239/249 authenticity passes, a missing-TypeScript error and 213/220 architecture passes. Its summary and full logs were copied to `external/wp007n/validation-missing-links/` before final reruns. That summary SHA-256 is `8e2c1837eec1b16aacc88e018aa48bca48a6d79db53c4a52c3c70379fb6f5977`.

Restoring only the root links recovered authenticity and TypeScript but left workspace-package resolution errors (222/228 architecture passes). Both checkouts then received local workspace package junctions to their own package source directories. This recovered all 256 architecture tests: 255 pass, with the same one CRLF-sensitive release-workflow test failing on N and the unchanged parent. The first attempt and intermediate attempt are runtime hydration failures, not scientific results or additional inherited product defects.

Recovery used only absent paths: root `node_modules` junctions to the existing L installation and workspace-local `node_modules` package links. No existing target was deleted, no package was downloaded, no lockfile/version was changed, no historical tracked source was edited, and no owner application was closed. All three package-lock byte hashes agree at `6fba42cb7869cb807ecefc422a1881ba96125b3a9b261e691609f15103855a69`.

The final receipt gate now requires full authenticity coverage, all required passing commands, exact unchanged-parent failure matching and complete architecture coverage. Known-answer tests reject both missing-dependency failures and reduced-coverage results even when the parent suffers the same runtime defect. Current final command results are in [validation-summary.json](validation-summary.json); external logs remain resumable local evidence.
