#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Coverage Gates Script (Option B - path-pattern classification)
# ============================================================================

LCOV_FILE="coverage/lcov.info"
BASELINE_FILE="scripts/coverage_baseline.json"

P1_PATTERNS=(
  "lib/p1_modules/"
  "lib/features/auth/"
  "lib/features/feed/"
  "lib/features/moderation/"
  "lib/features/privacy/"
  "lib/features/profile/"
  "lib/features/security/"
  "lib/core/auth/"
  "lib/core/security/"
  "lib/ui/screens/create/"
  "lib/ui/screens/home/"
  "lib/ui/screens/mod/"
  "lib/ui/screens/onboarding/"
  "lib/ui/screens/profile/"
  "lib/screens/"
  "lib/state/models/feed_models.dart"
  "lib/state/models/moderation.dart"
  "lib/state/providers/feed_providers.dart"
  "lib/state/providers/moderation_providers.dart"
  "lib/services/appeal_provider.dart"
  "lib/services/auth_service.dart"
  "lib/services/moderation_service.dart"
  "lib/services/post_service.dart"
  "lib/services/service_providers.dart"
)

P2_PATTERNS=(
  "lib/features/notifications/"
  "lib/core/analytics/"
  "lib/core/logging/"
  "lib/core/observability/"
  "lib/core/initialization/"
  "lib/services/push/"
  "lib/design_system/"
)

P3_PATTERNS=(
  "lib/features/paywall/"
  "lib/ui/screens/rewards/"
  "lib/state/models/reputation.dart"
  "lib/state/providers/reputation_providers.dart"
  "lib/widgets/"
  "lib/ui/components/"
  "lib/ui/theme/"
  "lib/ui/utils/"
  "lib/ui/screens/app_shell.dart"
  "lib/core/config/"
  "lib/core/network/"
  "lib/core/providers/"
  "lib/core/routing/"
  "lib/core/utils/"
  "lib/data/mock/"
  "lib/features/core/"
  "lib/models/"
  "lib/generated/"
  "lib/main.dart"
  "lib/state/models/settings.dart"
  "lib/state/providers/settings_providers.dart"
)

SHARED_PATTERNS=(
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

fail() {
  echo -e "${RED}❌ $1${NC}" >&2
  exit 1
}

warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

pass() {
  echo -e "${GREEN}✅ $1${NC}"
}

read_baseline_value() {
  local key="$1"
  if [[ ! -f "$BASELINE_FILE" ]]; then
    fail "Baseline file not found: $BASELINE_FILE"
  fi

  local value
  value=$(grep -Eo "\"$key\"[[:space:]]*:[[:space:]]*[0-9]+([.][0-9]+)?" "$BASELINE_FILE" | head -n1 | sed -E 's/.*:[[:space:]]*//' || true)
  if [[ -z "$value" ]]; then
    fail "Could not parse $key from $BASELINE_FILE"
  fi
  echo "$value"
}

write_baseline() {
  local total_min=$1
  local p1_min=$2
  local p2_min=$3
  local p3_min=$4
  printf '{\"total_min_percent\": %s, \"p1_min_percent\": %s, \"p2_min_percent\": %s, \"p3_min_percent\": %s}\n' \
    "$total_min" "$p1_min" "$p2_min" "$p3_min" > "$BASELINE_FILE"
}

update_baseline() {
  local scope="${1:-}"
  local new_value="${2:-}"

  if [[ -z "$scope" || -z "$new_value" ]]; then
    fail "Usage: $0 update-baseline <total|p1|p2|p3> <new_percent>"
  fi

  local total_min p1_min p2_min current
  total_min=$(read_baseline_value "total_min_percent")
  p1_min=$(read_baseline_value "p1_min_percent")
  p2_min=$(read_baseline_value "p2_min_percent")
  p3_min=$(read_baseline_value "p3_min_percent")

  case "$scope" in
    total)
      current=$total_min
      total_min=$new_value
      ;;
    p1)
      current=$p1_min
      p1_min=$new_value
      ;;
    p2)
      current=$p2_min
      p2_min=$new_value
      ;;
    p3)
      current=$p3_min
      p3_min=$new_value
      ;;
    *)
      fail "Unknown scope: $scope (use total|p1|p2|p3)"
      ;;
  esac

  if ! awk -v new="$new_value" -v current="$current" 'BEGIN { exit (new + 0 > current + 0) ? 0 : 1 }'; then
    fail "New baseline ($new_value%) must be greater than current ($current%)."
  fi

  write_baseline "$total_min" "$p1_min" "$p2_min" "$p3_min"
  pass "Baseline updated for $scope: $current% → $new_value%"
}

match_pattern() {
  local path=$1
  local -n patterns=$2
  for pat in "${patterns[@]}"; do
    if [[ "$path" == *"$pat"* ]]; then
      echo "$pat"
      return 0
    fi
  done
  return 1
}

classify_path() {
  local path=$1
  local match

  if match=$(match_pattern "$path" P1_PATTERNS); then
    echo "P1|$match"
    return 0
  fi
  if match=$(match_pattern "$path" P2_PATTERNS); then
    echo "P2|$match"
    return 0
  fi
  if match=$(match_pattern "$path" P3_PATTERNS); then
    echo "P3|$match"
    return 0
  fi
  if match=$(match_pattern "$path" SHARED_PATTERNS); then
    echo "shared|$match"
    return 0
  fi

  echo "unknown|"
}

declare -A coverage_ignore_ranges=()
declare -A coverage_ignore_loaded=()

load_coverage_ignore_ranges() {
  local source_file=$1
  local line_number=0
  local range_start=""
  local source_line
  local ranges=()

  if [[ -n "${coverage_ignore_loaded[$source_file]+x}" ]]; then
    return 0
  fi
  coverage_ignore_loaded[$source_file]=1

  # LCOV can contain external package sources. They are not repository files
  # and therefore cannot declare repository coverage exclusions.
  if [[ ! -f "$source_file" ]]; then
    coverage_ignore_ranges[$source_file]=""
    return 0
  fi

  while IFS= read -r source_line || [[ -n "$source_line" ]]; do
    line_number=$((line_number + 1))
    if [[ "$source_line" == *"coverage:ignore-start"* ]]; then
      if [[ -n "$range_start" ]]; then
        fail "Nested coverage:ignore-start in $source_file:$line_number"
      fi
      range_start=$line_number
    elif [[ "$source_line" == *"coverage:ignore-end"* ]]; then
      if [[ -z "$range_start" ]]; then
        fail "Unmatched coverage:ignore-end in $source_file:$line_number"
      fi
      ranges+=("$range_start:$line_number")
      range_start=""
    fi
  done < "$source_file"

  if [[ -n "$range_start" ]]; then
    fail "Unmatched coverage:ignore-start in $source_file:$range_start"
  fi

  coverage_ignore_ranges[$source_file]="${ranges[*]}"
}

is_coverage_ignored_line() {
  local source_file=$1
  local source_line=$2
  local range
  local range_start
  local range_end

  for range in ${coverage_ignore_ranges[$source_file]:-}; do
    range_start=${range%%:*}
    range_end=${range##*:}
    if [[ $source_line -ge $range_start && $source_line -le $range_end ]]; then
      return 0
    fi
  done
  return 1
}

parse_coverage() {
  if [[ ! -f "$LCOV_FILE" ]]; then
    fail "Coverage file not found: $LCOV_FILE. Run 'flutter test --coverage' first."
  fi

  total_lines=0
  total_hit=0
  p1_lines=0
  p1_hit=0
  p2_lines=0
  p2_hit=0
  p3_lines=0
  p3_hit=0
  shared_lines=0
  shared_hit=0
  unknown_lines=0
  unknown_hit=0
  ignored_lines=0

  current_scope="unknown"
  current_file=""

  declare -A unknown_seen=()
  unknown_files=()

  while IFS= read -r line; do
    if [[ "$line" == SF:* ]]; then
      path=${line#SF:}
      norm_path=${path//\\//}
      current_file=$norm_path
      load_coverage_ignore_ranges "$current_file"
      classification=$(classify_path "$norm_path")
      current_scope=${classification%%|*}
      if [[ "$current_scope" == "unknown" ]]; then
        if [[ -z "${unknown_seen[$norm_path]+x}" ]]; then
          unknown_files+=("$norm_path")
          unknown_seen[$norm_path]=1
        fi
      fi
    elif [[ "$line" == DA:* ]]; then
      line_data=${line#DA:*}
      source_line=${line_data%%,*}
      count=${line_data#*,}
      count=${count%%,*}

      if is_coverage_ignored_line "$current_file" "$source_line"; then
        ignored_lines=$((ignored_lines + 1))
        continue
      fi

      total_lines=$((total_lines + 1))
      if [[ "$count" != "0" ]]; then
        total_hit=$((total_hit + 1))
      fi

      case "$current_scope" in
        P1)
          p1_lines=$((p1_lines + 1))
          if [[ "$count" != "0" ]]; then
            p1_hit=$((p1_hit + 1))
          fi
          ;;
        P2)
          p2_lines=$((p2_lines + 1))
          if [[ "$count" != "0" ]]; then
            p2_hit=$((p2_hit + 1))
          fi
          ;;
        P3)
          p3_lines=$((p3_lines + 1))
          if [[ "$count" != "0" ]]; then
            p3_hit=$((p3_hit + 1))
          fi
          ;;
        shared)
          shared_lines=$((shared_lines + 1))
          if [[ "$count" != "0" ]]; then
            shared_hit=$((shared_hit + 1))
          fi
          ;;
        *)
          unknown_lines=$((unknown_lines + 1))
          if [[ "$count" != "0" ]]; then
            unknown_hit=$((unknown_hit + 1))
          fi
          ;;
      esac
    fi
  done < "$LCOV_FILE"
}

calc_percent_int() {
  local hit=$1
  local total=$2
  if [[ $total -eq 0 ]]; then
    echo "0"
  else
    echo $(( hit * 100 / total ))
  fi
}

calc_percent_float() {
  local hit=$1
  local total=$2
  if [[ $total -eq 0 ]]; then
    echo "0.00"
  else
    awk -v hit="$hit" -v total="$total" 'BEGIN { printf "%.2f", (hit * 100 / total) }'
  fi
}

num_ge() {
  awk -v lhs="$1" -v rhs="$2" 'BEGIN { exit ((lhs + 0) >= (rhs + 0)) ? 0 : 1 }'
}

num_gt() {
  awk -v lhs="$1" -v rhs="$2" 'BEGIN { exit ((lhs + 0) > (rhs + 0)) ? 0 : 1 }'
}

main() {
  if [[ "${1:-}" == "update-baseline" ]]; then
    update_baseline "${2:-}" "${3:-}"
    exit 0
  fi

  echo "════════════════════════════════════════════════════════════════════════"
  echo "                        COVERAGE GATES CHECK                            "
  echo "════════════════════════════════════════════════════════════════════════"
  echo ""

  parse_coverage

  if [[ $ignored_lines -gt 0 ]]; then
    echo "INFO: Ignored $ignored_lines instrumented line(s) using balanced source coverage directives."
  fi

  total_min=$(read_baseline_value "total_min_percent")
  p1_min=$(read_baseline_value "p1_min_percent")
  p2_min=$(read_baseline_value "p2_min_percent")
  p3_min=$(read_baseline_value "p3_min_percent")

  total_percent=$(calc_percent_float "$total_hit" "$total_lines")
  p1_percent=$(calc_percent_int "$p1_hit" "$p1_lines")
  p2_percent=$(calc_percent_int "$p2_hit" "$p2_lines")
  p3_percent=$(calc_percent_int "$p3_hit" "$p3_lines")
  shared_percent=$(calc_percent_int "$shared_hit" "$shared_lines")
  unknown_percent=$(calc_percent_int "$unknown_hit" "$unknown_lines")

  printf "\n%-12s | %8s | %8s | %9s | %10s | %s\n" "Scope" "Lines" "Hit" "Coverage" "Threshold" "Result"
  printf "%-12s-+-%8s-+-%8s-+-%9s-+-%10s-+-%s\n" "------------" "--------" "--------" "---------" "----------" "--------"

  failures=()

  if num_ge "$total_percent" "$total_min"; then
    result="${GREEN}PASS${NC}"
  else
    result="${RED}FAIL${NC}"
    failures+=("Total coverage ($total_percent%) is below baseline ($total_min%)")
  fi
  printf "%-12s | %8d | %8d | %8.2f%% | %9s%% | $result\n" "Total" "$total_lines" "$total_hit" "$total_percent" "$total_min"

  if [[ $p1_lines -eq 0 ]]; then
    result="${RED}FAIL${NC}"
    failures+=("P1 patterns matched 0 instrumented lines. Check P1_PATTERNS.")
    printf "%-12s | %8d | %8d | %8s | %9d%% | $result\n" "P1" "$p1_lines" "$p1_hit" "N/A" "$p1_min"
  elif num_ge "$p1_percent" "$p1_min"; then
    result="${GREEN}PASS${NC}"
    printf "%-12s | %8d | %8d | %8d%% | %9d%% | $result\n" "P1" "$p1_lines" "$p1_hit" "$p1_percent" "$p1_min"
  else
    result="${RED}FAIL${NC}"
    failures+=("P1 coverage ($p1_percent%) is below threshold ($p1_min%)")
    printf "%-12s | %8d | %8d | %8d%% | %9d%% | $result\n" "P1" "$p1_lines" "$p1_hit" "$p1_percent" "$p1_min"
  fi

  if [[ $p2_lines -eq 0 ]]; then
    if [[ $p2_min -gt 0 ]]; then
      result="${RED}FAIL${NC}"
      failures+=("P2 patterns matched 0 instrumented lines. Check P2_PATTERNS.")
    else
      result="${YELLOW}SKIP${NC}"
      warn "P2 patterns matched 0 lines; P2 baseline is 0 so gate is skipped."
    fi
    printf "%-12s | %8d | %8d | %8s | %9d%% | $result\n" "P2" "$p2_lines" "$p2_hit" "N/A" "$p2_min"
  elif num_ge "$p2_percent" "$p2_min"; then
    result="${GREEN}PASS${NC}"
    printf "%-12s | %8d | %8d | %8d%% | %9d%% | $result\n" "P2" "$p2_lines" "$p2_hit" "$p2_percent" "$p2_min"
  else
    result="${RED}FAIL${NC}"
    failures+=("P2 coverage ($p2_percent%) is below threshold ($p2_min%)")
    printf "%-12s | %8d | %8d | %8d%% | %9d%% | $result\n" "P2" "$p2_lines" "$p2_hit" "$p2_percent" "$p2_min"
  fi

  if [[ $p3_lines -eq 0 ]]; then
    if [[ $p3_min -gt 0 ]]; then
      result="${RED}FAIL${NC}"
      failures+=("P3 patterns matched 0 instrumented lines. Check P3_PATTERNS.")
    else
      result="${YELLOW}SKIP${NC}"
      warn "P3 patterns matched 0 lines; P3 baseline is 0 so gate is skipped."
    fi
    printf "%-12s | %8d | %8d | %8s | %9d%% | $result\n" "P3" "$p3_lines" "$p3_hit" "N/A" "$p3_min"
  elif num_ge "$p3_percent" "$p3_min"; then
    result="${GREEN}PASS${NC}"
    printf "%-12s | %8d | %8d | %8d%% | %9d%% | $result\n" "P3" "$p3_lines" "$p3_hit" "$p3_percent" "$p3_min"
    if [[ $p3_percent -lt 85 ]]; then
      warn "P3 coverage ($p3_percent%) is below target headroom (85%)."
    fi
  else
    result="${RED}FAIL${NC}"
    failures+=("P3 coverage ($p3_percent%) is below threshold ($p3_min%)")
    printf "%-12s | %8d | %8d | %8d%% | %9d%% | $result\n" "P3" "$p3_lines" "$p3_hit" "$p3_percent" "$p3_min"
  fi

  printf "%-12s | %8d | %8d | %8d%% | %9s | %s\n" "Shared" "$shared_lines" "$shared_hit" "$shared_percent" "-" "INFO"
  printf "%-12s | %8d | %8d | %8d%% | %9s | %s\n" "Unknown" "$unknown_lines" "$unknown_hit" "$unknown_percent" "-" "INFO"

  echo ""

  if [[ ${#unknown_files[@]} -gt 0 ]]; then
    echo -e "${YELLOW}Unknown files (no pattern match):${NC}"
    printf '%s\n' "${unknown_files[@]}" | sort
    echo ""
  fi

  if [[ ${#failures[@]} -gt 0 ]]; then
    echo -e "${RED}════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}                        COVERAGE GATES FAILED                           ${NC}"
    echo -e "${RED}════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    for failure in "${failures[@]}"; do
      echo -e "${RED}❌ $failure${NC}"
    done
    echo ""
    echo "To update baselines (ratchet up only):"
    echo "  bash scripts/check_coverage_gates.sh update-baseline total <new_percent>"
    echo "  bash scripts/check_coverage_gates.sh update-baseline p1 <new_percent>"
    echo "  bash scripts/check_coverage_gates.sh update-baseline p2 <new_percent>"
    echo "  bash scripts/check_coverage_gates.sh update-baseline p3 <new_percent>"
    echo ""
    exit 1
  fi

  echo -e "${GREEN}════════════════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}                     ALL COVERAGE GATES PASSED                          ${NC}"
  echo -e "${GREEN}════════════════════════════════════════════════════════════════════════${NC}"
  echo ""

  if num_gt "$total_percent" "$total_min"; then
    echo "Tip: Total coverage ($total_percent%) exceeds baseline ($total_min%)."
    echo "  bash scripts/check_coverage_gates.sh update-baseline total $total_percent"
    echo ""
  fi
  if num_gt "$p1_percent" "$p1_min"; then
    echo "Tip: P1 coverage ($p1_percent%) exceeds baseline ($p1_min%)."
    echo "  bash scripts/check_coverage_gates.sh update-baseline p1 $p1_percent"
    echo ""
  fi
  if [[ $p2_lines -gt 0 ]] && num_gt "$p2_percent" "$p2_min"; then
    echo "Tip: P2 coverage ($p2_percent%) exceeds baseline ($p2_min%)."
    echo "  bash scripts/check_coverage_gates.sh update-baseline p2 $p2_percent"
    echo ""
  fi
  if [[ $p3_lines -gt 0 ]] && num_gt "$p3_percent" "$p3_min"; then
    echo "Tip: P3 coverage ($p3_percent%) exceeds baseline ($p3_min%)."
    echo "  bash scripts/check_coverage_gates.sh update-baseline p3 $p3_percent"
    echo ""
  fi
}

main "$@"
