# Spectral file discovery

Spectral 6.15.0 calls only the asynchronous `fast-glob(patterns, options)` export
with `absolute` and `dot` enabled. This private compatibility package forwards
that call to the repository's maintained `glob` dependency. It is not a general
replacement for the full fast-glob API.

The adapter uses the root's already declared and locked `glob` dependency.
It does not maintain a separate dependency
graph or install a second glob version.

The override removes the Spectral → fast-glob → micromatch → braces chain.
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
lists every published braces version as affected and has no patched version.
The existing audit severity and lint failure gates remain in place.

`scripts/tests/spectral-glob.test.mjs` checks file discovery, exclusions and
negated extglobs, then runs the installed Spectral CLI against valid and invalid
documents. Rule failures and unmatched-pattern failures retain their exit codes.
Review compatibility before upgrading Spectral or adding another fast-glob
consumer.

GitHub's native dependency graph identifies linked local lock entries by their
repository path (`tools/openapi/spectral-glob`), rather than the module's import
name. The coverage checker retains that identity and still requires complete
native coverage of the local entry and every changed registry dependency.
