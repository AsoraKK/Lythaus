import * as fs from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import jp = require('jsonpointer');

const spec = JSON.parse(fs.readFileSync('api/openapi/dist/openapi.json', 'utf8'));
function deref(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if (value.$ref) return deref(jp.get(spec, value.$ref.substring(1)));
  if (Array.isArray(value)) return value.map(deref);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deref(item)]));
}
const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv);
const schema = (name: string) => ajv.compile(deref(spec.components.schemas[name]));

describe('canonical activity pilot contract', () => {
  test('all four invoked operations retain their authentication and generated Privacy/Admin surfaces', () => {
    for (const [path, methods] of [['/analytics/activity-consent', ['get', 'put']], ['/analytics/activity', ['post']], ['/admin/activity-measurement', ['get']]] as const) {
      for (const method of methods) {
        const operation = spec.paths[path][method];
        expect(operation.security).toEqual([{ [path.startsWith('/admin') ? 'cloudflareAccess' : 'bearerAuth']: [] }]);
        expect(operation.responses['429']).toBeDefined(); expect(operation.responses['503']).toBeDefined();
        const generated = fs.readFileSync(`lib/generated/api_client/lib/src/api/${path.startsWith('/admin') ? 'admin' : 'privacy'}_api.dart`, 'utf8');
        expect(generated).toContain(operation.operationId + '(');
      }
    }
    expect(spec.paths['/admin/activity-measurement'].servers).toEqual([{ url: 'https://admin-api.lythaus.co/api' }]);
  });

  test('exact consent and render inputs reject client timestamps, identity and browsing data', () => {
    const validate = schema('ActivityRenderInput');
    const body = { signal: 'foreground_app_render', consentRevision: 1, consentEpoch: '018f0000-0000-7000-8000-000000000001',
      accountScope: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', noticeVersion: 'activity-account-day-v1' };
    expect(validate(body)).toBe(true);
    for (const key of ['userId', 'url', 'body', 'timestamp', 'activeDay']) expect(validate({ ...body, [key]: 'private' })).toBe(false);
    expect(validate({ ...body, consentRevision: 0 })).toBe(false);
    expect(schema('ActivityConsentInput')({ enabled: false, expectedRevision: 0, expectedEpoch: null,
      accountScope: body.accountScope, noticeVersion: body.noticeVersion })).toBe(true);
  });

  test('aggregate shape preserves nullable unavailable values and zero without exposing raw identities', () => {
    const metric = { state: 'available', value: 0, observedLowerBound: null, cohortSize: 1,
      since: '2026-10-06T00:00:00.000Z', until: '2026-10-07T00:00:00.000Z', reason: null };
    const data = { contractVersion: 'activity-pilot-v1', enabled: true, sampledAt: '2026-10-07T12:00:00.000Z', timezone: 'UTC',
      source: 'privacy.account_active_days', population: 'Synthetic consenting cohort', windowBasis: 'completed_utc_days', retentionDays: 61, accountLimit: 5000,
      metrics: { dau: metric, wau: metric, mau: metric, quiet: { ...metric, state: 'unavailable', value: null, reason: 'incomplete_measurement_coverage' } } };
    const validate = schema('ActivitySummary'); expect(validate(data)).toBe(true);
    expect(validate({ ...data, userId: 'private' })).toBe(false);
    expect(validate({ ...data, metrics: { ...data.metrics, dau: { ...metric, value: -1 } } })).toBe(false);
  });
});
