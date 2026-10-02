import * as fs from 'node:fs';
import * as path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import jp = require('jsonpointer');

const spec = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'api/openapi/dist/openapi.json'), 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const lookupPath = '/admin/account-support/lookup';
const historyPath = '/admin/account-support/users/{userId}/history';

function deref(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if (value.$ref) return deref(jp.get(spec, value.$ref.substring(1)));
  if (Array.isArray(value)) return value.map(deref);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deref(item)]));
}

function content(route: string, status: 'request' | '200' | '503') {
  const operation = spec.paths[route].post;
  return status === 'request' ? operation.requestBody.content['application/json']
    : deref(operation.responses[status]).content['application/json'];
}

function validator(route: string, status: 'request' | '200' | '503') {
  return ajv.compile(deref(content(route, status).schema));
}

describe('owner read-only account support contract', () => {
  test('documents only the three admin methods, independently Access-protected', () => {
    const supportPaths = Object.keys(spec.paths).filter(route => route.includes('account-support'));
    expect(supportPaths.sort()).toEqual(['/admin/account-support/access', lookupPath, historyPath].sort());
    for (const [route, method] of [['/admin/account-support/access', 'get'], [lookupPath, 'post'], [historyPath, 'post']]) {
      const item = spec.paths[route];
      expect(item.servers).toEqual([{ url: 'https://admin-api.lythaus.co/api' }]);
      expect(Object.keys(item).filter(key => ['get', 'post', 'put', 'patch', 'delete'].includes(key))).toEqual([method]);
      expect(item[method].security).toEqual([{ cloudflareAccess: [] }]);
      for (const status of ['401', '403', '404', '405', '429', '503']) expect(item[method].responses[status]).toBeDefined();
    }
    expect(JSON.stringify(spec.paths)).not.toContain('/keeper-account-support/');
  });

  test('requires a reason and rejects unknown input fields and unsafe filters', () => {
    const lookup = validator(lookupPath, 'request');
    expect(lookup({ email: 'synthetic@example.invalid', reasonCode: 'SUPPORT_REQUEST' })).toBe(true);
    expect(lookup({ email: 'synthetic@example.invalid' })).toBe(false);
    expect(lookup({ email: 'synthetic@example.invalid', reasonCode: 'SUPPORT_REQUEST', token: 'secret' })).toBe(false);
    const history = validator(historyPath, 'request');
    expect(history({ reasonCode: 'SUPPORT_REQUEST', source: 'audit', order: 'oldest', limit: 50 })).toBe(true);
    for (const extra of [{ source: 'all' }, { limit: 51 }, { limit: 0 }, { eventType: 'private prose' }, { cursor: 'https://private.invalid' }, { since: '2026-10-01T00:00:00+01:00' }, { metadata: {} }]) {
      expect(history({ reasonCode: 'SUPPORT_REQUEST', ...extra })).toBe(false);
    }
  });

  test('validates found, missing and ambiguous states with a strict minimum account allowlist', () => {
    const response = validator(lookupPath, '200');
    const examples = content(lookupPath, '200').examples;
    for (const example of Object.values<any>(examples)) expect(response(example.value)).toBe(true);
    const found = examples.found.value;
    for (const property of ['email', 'emailHmac', 'passwordHash', 'token', 'resetLink', 'privateContent']) {
      expect(response({ ...found, account: { ...found.account, [property]: 'secret' } })).toBe(false);
    }
    expect(response({ ...found, account: { ...found.account, activeSessionCount: -1 } })).toBe(false);
    expect(response({ ...found, account: { ...found.account, status: 'unknown' } })).toBe(false);
  });

  test('keeps empty and populated histories explicitly partial with nullable missing correlations', () => {
    const response = validator(historyPath, '200');
    const empty = content(historyPath, '200').example;
    expect(response(empty)).toBe(true);
    expect(empty.coverage).toBe('partial');
    expect(empty.notice).toMatch(/does not prove/);
    const item = { id: '01900000-0000-7000-8000-000000000001', source: 'account', eventType: 'account.created',
      createdAt: '2026-10-01T00:00:00.000001Z', correlationId: null, reasonCode: null, category: 'account', outcome: null };
    expect(response({ ...empty, items: [item] })).toBe(true);
    for (const property of ['metadata', 'body', 'title', 'explanation', 'privateContent']) {
      expect(response({ ...empty, items: [{ ...item, [property]: 'secret' }] })).toBe(false);
    }
    expect(response({ ...empty, coverage: 'complete' })).toBe(false);
    const { notice: _notice, ...noNotice } = empty;
    expect(response(noNotice)).toBe(false);
  });

  test('unavailable evidence is an error without account data or fabricated empty history', () => {
    const response = validator(historyPath, '503');
    const unavailable = content(historyPath, '503').example;
    expect(response(unavailable)).toBe(true);
    for (const extra of [{ items: [] }, { account: null }, { message: 'private database credentials' }]) {
      expect(response({ ...unavailable, ...extra })).toBe(false);
    }
  });
});
