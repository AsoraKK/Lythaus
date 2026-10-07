import { readFileSync } from 'node:fs';
import { assertAdminMutationRequest } from '../../apps/lythaus-admin-api/src/admin-cors-policy.ts';

const input = JSON.parse(readFileSync(0, 'utf8'));
const request = new Request(input.url, {
  method: input.method,
  headers: input.headers,
  body: input.body,
});
let status = 200;
let error;
try {
  assertAdminMutationRequest(request, 'https://admin.lythaus.co');
} catch (failure) {
  error = failure.message;
  if (error === 'admin_mutation_origin_invalid') status = 403;
  else if (error === 'admin_mutation_content_type_invalid') status = 415;
  else throw failure;
}
process.stdout.write(JSON.stringify({ status, error }));
