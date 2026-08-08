#!/usr/bin/env bash
# Exact Cloudflare Pages preview values. No permanent preview hostname exists.
set -euo pipefail

: "${WEB_BASE_URL:?Set the exact Pages preview URL}"
: "${API_BASE_URL:?Set the exact temporary Worker preview /api URL}"
: "${AUTH_URL:?Set the exact temporary Worker preview /api URL}"
: "${ADMIN_API_URL:?Set the exact reviewed admin API /api URL}"
: "${MARKETING_BASE_URL:?Set the exact marketing preview URL}"

export ENVIRONMENT=preview
export WEB_BASE_URL API_BASE_URL AUTH_URL ADMIN_API_URL MARKETING_BASE_URL
