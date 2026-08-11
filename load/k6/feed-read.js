import http from 'k6/http';
import { check, sleep } from 'k6';
import { readDurationThreshold, resolveUrl } from './utils.js';

// The launch contract is a hard p95 of strictly less than 200ms. Keep p99
// configurable for diagnostic runs, but never permit the p95 gate to drift.
const feedReadP99Threshold = readDurationThreshold(__ENV, 'FEED_READ_P99_THRESHOLD', 400);

export const options = {
  scenarios: {
    steady: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 5),
      duration: __ENV.DURATION || '60s',
    },
  },
  thresholds: {
    // Tag-based thresholds for endpoint-level metrics
    'http_req_failed{endpoint:feed}': ['rate<0.01'],
    'http_req_duration{endpoint:feed}': [
      'p(95)<200',
      `p(99)<${feedReadP99Threshold}`,
    ],
    // Scenario-based thresholds (more precise for multi-scenario tests)
    'http_req_duration{scenario:steady}': [
      'p(95)<200',
      `p(99)<${feedReadP99Threshold}`,
    ],
  },
  summaryTrendStats: ['min', 'avg', 'med', 'p(75)', 'p(90)', 'p(95)', 'p(99)'],
  tags: { test: 'feed-read' },
};

const BASE = __ENV.K6_BASE_URL;
if (!BASE) throw new Error('K6_BASE_URL is required');

function buildFeedUrl() {
  const feedBase = resolveUrl(BASE, __ENV.FEED_PATH || '/feed/discover');
  const query = __ENV.FEED_QUERY || 'guest=1&limit=10';
  return `${feedBase}?${query}`;
}

export default function () {
  // Discovery is intentionally credential-free so the gateway's approved
  // anonymous cache behaviour is exercised. Authenticated traffic is covered
  // by the protected API smoke suite and must never be cacheable.
  const res = http.get(buildFeedUrl(), { tags: { endpoint: 'feed' } });
  check(res, { 'status 200/204': (r) => r.status === 200 || r.status === 204 });
  sleep(1);
}

export function handleSummary(data) {
  const metrics = data.metrics;
  const p95 = metrics['http_req_duration{endpoint:feed}']?.values?.['p(95)'] || 0;
  const p99 = metrics['http_req_duration{endpoint:feed}']?.values?.['p(99)'] || 0;
  const p50 = metrics['http_req_duration{endpoint:feed}']?.values?.med || 0;
  const p75 = metrics['http_req_duration{endpoint:feed}']?.values?.['p(75)'] || 0;
  const p90 = metrics['http_req_duration{endpoint:feed}']?.values?.['p(90)'] || 0;
  const errorRate = metrics['http_req_failed{endpoint:feed}']?.values?.rate || 0;
  
  const textSummary = `Feed Read Test Results
=======================
p95: ${p95.toFixed(2)}ms
p99: ${p99.toFixed(2)}ms
p50: ${p50.toFixed(2)}ms
p75: ${p75.toFixed(2)}ms
p90: ${p90.toFixed(2)}ms
error_rate: ${(errorRate * 100).toFixed(2)}%
iterations: ${metrics.iterations?.values?.count || 0}
`;

  return {
    [`load/k6/${__ENV.SUMMARY_PREFIX || 'feed-read'}-summary.json`]: JSON.stringify(data, null, 2),
    [`load/k6/${__ENV.SUMMARY_PREFIX || 'feed-read'}-summary.txt`]: textSummary,
  };
}
