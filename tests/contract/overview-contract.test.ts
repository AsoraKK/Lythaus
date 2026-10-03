import * as fs from 'node:fs';
import * as path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import jp = require('jsonpointer');

const spec = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'api/openapi/dist/openapi.json'), 'utf8'));
function deref(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if (value.$ref) return deref(jp.get(spec, value.$ref.substring(1)));
  if (Array.isArray(value)) return value.map(deref);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deref(item)]));
}
const item = spec.paths['/admin/overview'];
const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv);
const validate = ajv.compile(deref(item.get.responses['200'].content['application/json'].schema));
const metric = { value: 0, previous: null, changePercent: null, availability: 'available', reason: null,
  source: 'Synthetic test source', definition: 'Synthetic test definition', unit: 'count' };
const metricNames = ['posts', 'comments', 'commentsPerPost', 'unansweredPosts', 'uniqueContributors', 'newRegistrations', 'subscriptionsFree', 'subscriptionsPremium', 'subscriptionsBlack'];
const gapNames = ['newVerifiedUsers', 'returningUsers', 'retentionRate', 'quietUsers', 'upgrades', 'cancellations', 'revenue', 'suspectedAiFlags', 'confirmedAiClassifications', 'appealOutcomes'];
const provider = { enabled: false, status: 'unavailable', reason: 'Runtime binding unverified', sampledAt: null,
  accruedCost: null, finalizedCost: null, currency: null, accountingPeriod: null };
const sample = () => ({ contractVersion: 'overview-v1', timezone: 'UTC', sampledAt: '2026-10-02T12:00:00.000Z', period: 'today',
  current: { start: '2026-10-02T00:00:00.000Z', end: '2026-10-02T12:00:00.000Z' },
  previous: { start: '2026-10-01T00:00:00.000Z', end: '2026-10-01T12:00:00.000Z' },
  comparable: true, coverage: 'retained_current_state', cacheTtlSeconds: 60, rowLimit: 5000,
  metrics: Object.fromEntries(metricNames.map(name => [name, { ...metric }])),
  gaps: Object.fromEntries(gapNames.map(name => [name, 'No certified source'])),
  providers: { cloudflare: { ...provider }, planetscale: { ...provider } }, correlationId: 'synthetic-contract' });

describe('bounded Overview contract', () => {
  test('publishes only an Access-protected read on the canonical administrator server', () => {
    expect(item.servers).toEqual([{ url: 'https://admin-api.lythaus.co/api' }]);
    expect(Object.keys(item).filter(key => ['get', 'post', 'patch', 'delete'].includes(key))).toEqual(['get']);
    expect(item.get.security).toEqual([{ cloudflareAccess: [] }]);
    expect(item.get.description).toMatch(/current active owner/);
    expect(item.get.parameters[0].schema.enum).toEqual(['today', 'mtd', 'ytd']);
    for (const status of ['400', '401', '403', '429', '503']) expect(item.get.responses[status]).toBeDefined();
    expect(item.get.responses['200'].headers['Cache-Control'].schema.enum).toEqual(['private, no-store']);
  });

  test('retains zero, unavailable cohorts and signed changes without inventing payment', () => {
    const data = sample();
    data.metrics.commentsPerPost = { ...metric, value: null, availability: 'unavailable', reason: 'empty_or_unavailable_post_cohort', unit: 'ratio' };
    data.metrics.posts = { ...metric, value: 2, previous: 4, changePercent: -50 };
    expect(validate(data)).toBe(true);
    expect(data.providers.cloudflare.accruedCost).toBeNull();
    expect(data.providers.planetscale.finalizedCost).toBeNull();
    for (const invalid of [{ timezone: 'Europe/London' }, { period: 'month' }, { coverage: 'complete_event_ledger' }, { cacheTtlSeconds: 600 }])
      expect(validate({ ...data, ...invalid })).toBe(false);
  });

  test('rejects identity, content and undeclared metric fields in aggregate responses', () => {
    const data = sample();
    for (const property of ['email', 'userId', 'body', 'password', 'token', 'rawSql']) {
      expect(validate({ ...data, [property]: 'private' })).toBe(false);
      expect(validate({ ...data, metrics: { ...data.metrics, posts: { ...metric, [property]: 'private' } } })).toBe(false);
      expect(validate({ ...data, providers: { ...data.providers, cloudflare: { ...provider, [property]: 'private' } } })).toBe(false);
    }
    expect(validate({ ...data, metrics: { ...data.metrics, inventedRevenue: metric } })).toBe(false);
    const incomplete = sample(); delete incomplete.metrics.posts;
    expect(validate(incomplete)).toBe(false);
    expect(validate({ ...data, metrics: { ...data.metrics, posts: { ...metric, value: -1 } } })).toBe(false);
  });

  test('validates currency and complete accounting-period shape without merging accrued and finalized amounts', () => {
    const data = sample();
    expect(validate({ ...data, providers: { ...data.providers, cloudflare: { ...provider, accruedCost: 1, finalizedCost: null, currency: 'USD',
      accountingPeriod: { start: '2026-10-01T00:00:00Z', end: '2026-11-01T00:00:00Z' } } } })).toBe(true);
    expect(validate({ ...data, providers: { ...data.providers, cloudflare: { ...provider, currency: '$' } } })).toBe(false);
    expect(validate({ ...data, providers: { ...data.providers, cloudflare: { ...provider, accountingPeriod: { start: '2026-10-01T00:00:00Z' } } } })).toBe(false);
  });
});
