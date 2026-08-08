import * as fs from 'node:fs';
import * as path from 'node:path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import jp = require('jsonpointer');

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

const spec = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'api/openapi/dist/openapi.json'), 'utf8')
);

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

function deref<T = any>(schema: T, root: any = spec): T {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  if ((schema as any).$ref && typeof (schema as any).$ref === 'string') {
    const ref = (schema as any).$ref as string;
    if (ref.startsWith('#/')) {
      return deref(jp.get(root, ref.substring(1)), root);
    }
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map((entry) => deref(entry, root)) as unknown as T;
  }

  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    clone[key] = deref(value, root);
  }
  return clone as T;
}

function getOperation(pathKey: string, method: HttpMethod): Record<string, any> {
  const operation = spec.paths?.[pathKey]?.[method];
  if (!operation) {
    throw new Error(`Operation not found: ${method.toUpperCase()} ${pathKey}`);
  }
  return operation;
}

function getRequestContent(
  pathKey: string,
  method: HttpMethod,
  contentType = 'application/json'
): Record<string, any> {
  const content = getOperation(pathKey, method)?.requestBody?.content?.[contentType];
  if (!content) {
    throw new Error(`Request content not found for ${method.toUpperCase()} ${pathKey} (${contentType})`);
  }
  return content;
}

function getResponseContent(
  pathKey: string,
  method: HttpMethod,
  status: string,
  contentType = 'application/json'
): Record<string, any> {
  const content = getOperation(pathKey, method)?.responses?.[status]?.content?.[contentType];
  if (!content) {
    throw new Error(
      `Response content not found for ${method.toUpperCase()} ${pathKey} ${status} (${contentType})`
    );
  }
  return content;
}

function getExampleValue(content: Record<string, any>, exampleKey?: string): unknown {
  if (exampleKey) {
    const value = content?.examples?.[exampleKey]?.value;
    if (value === undefined) {
      throw new Error(`Example "${exampleKey}" not found`);
    }
    return value;
  }

  if (content.example !== undefined) {
    return content.example;
  }

  const firstExample = Object.values<Record<string, any>>(content.examples || {})[0]?.value;
  if (firstExample === undefined) {
    throw new Error('No example found');
  }
  return firstExample;
}

function expectValidSchema(schema: unknown, payload: unknown, label: string): void {
  const validate = ajv.compile(deref(schema));
  const ok = validate(payload);
  if (!ok) {
    throw new Error(`${label} failed schema validation: ${JSON.stringify(validate.errors)}`);
  }
}

function getParameterSchema(
  pathKey: string,
  method: HttpMethod,
  name: string,
  location: 'query' | 'path' | 'header'
): unknown {
  const operation = getOperation(pathKey, method);
  const parameters = [...(spec.paths?.[pathKey]?.parameters || []), ...(operation.parameters || [])].map((entry) =>
    deref(entry)
  );
  const match = parameters.find(
    (parameter: Record<string, any>) => parameter?.name === name && parameter?.in === location
  );
  if (!match?.schema) {
    throw new Error(`Parameter schema not found: ${location} ${name} on ${method.toUpperCase()} ${pathKey}`);
  }
  return match.schema;
}

describe('critical request examples', () => {
  const cases: Array<{ label: string; pathKey: string; method: HttpMethod; exampleKey: string }> = [
    { label: 'email auth', pathKey: '/auth/email', method: 'post', exampleKey: 'login' },
    { label: 'auth redeem invite', pathKey: '/auth/redeem-invite', method: 'post', exampleKey: 'redeem' },
    { label: 'post create', pathKey: '/post', method: 'post', exampleKey: 'basicPost' },
    { label: 'moderation flag', pathKey: '/moderation/flag', method: 'post', exampleKey: 'spamFlag' },
    { label: 'moderation appeal', pathKey: '/moderation/appeals', method: 'post', exampleKey: 'standard' },
    {
      label: 'moderation appeal vote',
      pathKey: '/moderation/appeals/{appealId}/vote',
      method: 'post',
      exampleKey: 'uphold',
    },
    { label: 'privacy admin export', pathKey: '/_admin/dsr/export', method: 'post', exampleKey: 'enqueueExport' },
    { label: 'admin invite create', pathKey: '/_admin/invites', method: 'post', exampleKey: 'singleUse' },
  ];

  test.each(cases)('$label request stays schema-valid', ({ pathKey, method, exampleKey }) => {
    const content = getRequestContent(pathKey, method);
    expectValidSchema(content.schema, getExampleValue(content, exampleKey), `${method.toUpperCase()} ${pathKey}`);
  });
});

describe('critical response examples', () => {
  const cases: Array<{
    label: string;
    pathKey: string;
    method: HttpMethod;
    status: string;
    exampleKey: string;
  }> = [
    { label: 'email auth', pathKey: '/auth/email', method: 'post', status: '200', exampleKey: 'success' },
    { label: 'auth userinfo', pathKey: '/auth/userinfo', method: 'get', status: '200', exampleKey: 'authenticated' },
    {
      label: 'auth redeem invite',
      pathKey: '/auth/redeem-invite',
      method: 'post',
      status: '200',
      exampleKey: 'success',
    },
    { label: 'feed', pathKey: '/feed', method: 'get', status: '200', exampleKey: 'authenticated' },
    { label: 'post create', pathKey: '/post', method: 'post', status: '201', exampleKey: 'published' },
    { label: 'moderation flag', pathKey: '/moderation/flag', method: 'post', status: '202', exampleKey: 'queued' },
    {
      label: 'moderation appeal',
      pathKey: '/moderation/appeals',
      method: 'post',
      status: '201',
      exampleKey: 'created',
    },
    {
      label: 'moderation appeal vote',
      pathKey: '/moderation/appeals/{appealId}/vote',
      method: 'post',
      status: '200',
      exampleKey: 'recorded',
    },
    {
      label: 'privacy request accepted',
      pathKey: '/privacy/requests',
      method: 'post',
      status: '202',
      exampleKey: 'accepted',
    },
    {
      label: 'privacy request status',
      pathKey: '/privacy/requests',
      method: 'get',
      status: '200',
      exampleKey: 'processing',
    },
    {
      label: 'privacy admin export',
      pathKey: '/_admin/dsr/export',
      method: 'post',
      status: '202',
      exampleKey: 'queuedExport',
    },
    { label: 'admin invite create', pathKey: '/_admin/invites', method: 'post', status: '201', exampleKey: 'created' },
  ];

  test.each(cases)('$label response stays schema-valid', ({ pathKey, method, status, exampleKey }) => {
    const content = getResponseContent(pathKey, method, status);
    expectValidSchema(
      content.schema,
      getExampleValue(content, exampleKey),
      `${method.toUpperCase()} ${pathKey} ${status}`
    );
  });
});

describe('critical parameter contracts', () => {
  test('feed query fixtures stay schema-valid', () => {
    expectValidSchema(getParameterSchema('/feed', 'get', 'cursor', 'query'), 'first', 'GET /feed cursor');
    expectValidSchema(getParameterSchema('/feed', 'get', 'limit', 'query'), 20, 'GET /feed limit');
  });
});
