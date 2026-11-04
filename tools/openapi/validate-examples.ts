import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import jp from 'jsonpointer';

const specPath = path.resolve('api/openapi/dist/openapi.json');
if (!fs.existsSync(specPath)) {
  console.error(`Spec file not found at ${specPath}`);
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

let errors = 0;

function deref<T = any>(schema: T, root: any): T {
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
  const clone: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema as Record<string, any>)) {
    clone[key] = deref(value, root);
  }
  return clone as unknown as T;
}

for (const [specPathKey, operations] of Object.entries<Record<string, any>>(spec.paths || {})) {
  for (const [method, operation] of Object.entries<Record<string, any>>(operations || {})) {
    const requestContent = operation?.requestBody?.content || {};
    for (const [contentType, content] of Object.entries<Record<string, any>>(requestContent)) {
      if (!content?.schema) {
        continue;
      }
      validateExamples({
        specPathKey,
        method,
        label: 'requestBody',
        contentType,
        content,
      });
    }

    const responses = operation?.responses || {};
    for (const [code, response] of Object.entries<Record<string, any>>(responses)) {
      const responseContent = response?.content || {};
      for (const [contentType, content] of Object.entries<Record<string, any>>(responseContent)) {
        if (!content?.schema) {
          continue;
        }
        validateExamples({
          specPathKey,
          method,
          label: `response ${code}`,
          contentType,
          content,
        });
      }
    }
  }
}

process.exit(errors ? 1 : 0);

function validateExamples({
  specPathKey,
  method,
  label,
  contentType,
  content,
}: {
  specPathKey: string;
  method: string;
  label: string;
  contentType: string;
  content: Record<string, any>;
}) {
  const schema = deref(content.schema, spec);
  if (!schema) {
    return;
  }

  const validate = ajv.compile(schema);

  if (content.example !== undefined) {
    validateSyntheticExamples(content.example, `${specPathKey} example`);
    if (!validate(content.example)) {
      report(specPathKey, method, label, contentType, validate.errors);
    }
  }

  const examples = content.examples || {};
  for (const [exampleKey, exampleObject] of Object.entries<Record<string, any>>(examples)) {
    const exampleValue = exampleObject?.value;
    if (exampleValue === undefined) {
      continue;
    }
    validateSyntheticExamples(exampleValue, `${specPathKey}#${exampleKey}`);
    if (!validate(exampleValue)) {
      report(`${specPathKey}#${exampleKey}`, method, label, contentType, validate.errors);
    }
  }
}

function validateSyntheticExamples(value: unknown, location: string) {
  if (typeof value === 'string') {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    const isSyntheticUuid = /^00000000-0000-4000-8000-[0-9a-f]{12}$/i.test(value);
    if (isUuid && !isSyntheticUuid) {
      errors += 1;
      console.error(`OpenAPI UUID example is not marked synthetic at ${location}`);
    }

    const isTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
    if (isTimestamp && !value.startsWith('2000-01-')) {
      errors += 1;
      console.error(`OpenAPI timestamp example is not marked synthetic at ${location}`);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'password' || key === 'accessToken' || key === 'refreshToken' || key === 'turnstileToken') {
      if (typeof fieldValue !== 'string' || !fieldValue.startsWith('SYNTHETIC-EXAMPLE-ONLY-')) {
        errors += 1;
        console.error(`Credential-shaped OpenAPI example is not marked synthetic at ${location}/${key}`);
      }
      continue;
    }

    if (Array.isArray(fieldValue)) {
      fieldValue.forEach((entry, index) => validateSyntheticExamples(entry, `${location}/${key}[${index}]`));
    } else {
      validateSyntheticExamples(fieldValue, `${location}/${key}`);
    }
  }
}

function report(specPathKey: string, method: string, label: string, contentType: string, ajvErrors: any) {
  errors += 1;
  console.error(
    `Example validation failed for ${method.toUpperCase()} ${specPathKey} ${label} (${contentType})`
  );
  console.error(JSON.stringify(ajvErrors, null, 2));
}
