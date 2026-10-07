import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML = require('yaml');

const canonical = YAML.parse(fs.readFileSync(path.join(process.cwd(), 'api/openapi/product-integrity.yaml'), 'utf8'));
const bundled = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'api/openapi/dist/openapi.json'), 'utf8'));
const operations = [
  ['/admin/privacy/legal-holds', 'post', 'adminLegalHoldsCreate'],
  ['/admin/privacy/legal-holds/{holdId}/clear', 'post', 'adminLegalHoldsClear'],
  ['/admin/editorial/publications', 'post', 'adminEditorialPublicationsCreate'],
  ['/admin/moderation/cases/{caseId}/decision', 'post', 'adminModerationDecision'],
  ['/admin/appeals/{appealId}/adjudications', 'post', 'adminAppealsAdjudicate'],
  ['/admin/reviewers/{reviewerId}/qualification', 'post', 'adminReviewerQualificationCreate'],
  ['/admin/reviewers/{reviewerId}/qualification', 'put', 'adminReviewerQualificationUpdate'],
  ['/admin/users/{userId}/status', 'post', 'adminUsersStatusUpdate'],
  ['/admin/users/{userId}/tier', 'post', 'adminUsersTierUpdate'],
];

function resolve(spec: any, value: any): any {
  if (!value?.$ref) return value;
  return resolve(spec, value.$ref.slice(2).split('/').reduce((node: any, key: string) => node[key], spec));
}

describe.each([['canonical', canonical], ['bundled', bundled]])('%s Admin admission', (_name, spec) => {
  test.each(operations)('%s %s declares the configured server, Origin and admission errors', (route, method, id) => {
    const item = spec.paths[route];
    const operation = item[method];
    expect(operation.operationId).toBe(id);
    expect((operation.servers ?? item.servers ?? spec.servers)[0].url).toBe('https://admin.lythaus.co/api');
    const origin = operation.parameters?.map((parameter: any) => resolve(spec, parameter))
      .find((parameter: any) => parameter.in === 'header' && parameter.name === 'Origin');
    expect(origin).toMatchObject({ required: true, schema: { type: 'string', default: 'https://admin.lythaus.co' } });
    expect(operation.parameters?.map((parameter: any) => resolve(spec, parameter))
      .some((parameter: any) => parameter.in === 'header' && parameter.name.toLowerCase() === 'content-type')).not.toBe(true);
    for (const status of ['403', '415']) {
      expect(resolve(spec, operation.responses[status]).content['application/json'].schema).toBeDefined();
    }
  });

  test('bodyless hold clearing declares optional JSON content', () => {
    const body = spec.paths['/admin/privacy/legal-holds/{holdId}/clear'].post.requestBody;
    expect(body.required).toBe(false);
    expect(body.content['application/json'].schema).toMatchObject({ type: 'object', additionalProperties: true });
    expect(body.content['application/json'].example).toEqual({});
  });

  test('legal-hold GET retains its separate server and bodyless read contract', () => {
    const item = spec.paths['/admin/privacy/legal-holds'];
    expect((item.get.servers ?? item.servers)[0].url).toBe('https://admin-api.lythaus.co/api');
    expect(item.get.requestBody).toBeUndefined();
    expect(item.get.parameters?.map((parameter: any) => resolve(spec, parameter))
      .some((parameter: any) => parameter.name === 'Origin')).not.toBe(true);
  });
});
