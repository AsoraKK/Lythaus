# Reliability review baseline — 2026-10-25 UTC

## Follow-up environment correction

Cached Flutter 3.41.1/Dart 3.11.0 is at `/workspace/.lythaus-tools/flutter-sdk/flutter`; Pub dependencies resolved offline from `/workspace/.lythaus-cache/pub`. Docker 28.4.0 and cached `postgres:17` supported a disposable loopback comment fixture. No SDK install or privileged package access was needed. The disposable container/database were removed after tests. See REPORT.md for final coverage and remaining limits. Exact source pins follow.

- Review branch: `review/e2e-reliability-20261025`; worktree `/workspace/lythaus-e2e-review`.
- Remote main verified with `git ls-remote origin refs/heads/main`: `c0963c36693476ecc49ab1fcba0572454926b4d3`.
- Original saved checkout (unchanged): `54a78b79c3e75df8c56f24abbe6330ee52c11b6d`.
- Last reported deployed release: `3880a8be4c89459dd7ef831c9385817a887511ef`; commit exists locally. Deployment was not independently queried; never equate main or pending code with live behavior.
- #1084: `ef288ef2819382afd571256d3f9e31e8bb8383bb`
- #1086: `3cdddaaaf7107d009bc89f5dd474a037f1168eec`
- #1087: `9c73ac3a39b3c2374071ad30b37f4deb5c854dbc`
- #1090: `a10c381213373c0cb93e7dbc14404806ddf21cf2`
- #1091: `c1456d9bfaab372c9a529b81b5c2a76dfcb2ce75`
- #1092: `b85fe4f1ae367c8ef461c8fd127a75ebde56b9b2`
- #1093: `d64d00b0c97a9a2063bfdb4dc9b8b5c9db1038ae`

PR heads were fetched as `refs/review/<number>` for read-only inspection. Node v24.19.0 is installed. The repository `.agents` directory was absent. `AGENTS.md` was read. Flutter and PostgreSQL were located in the saved environment cache and used for the bounded local tests.
