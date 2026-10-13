import { pathToFileURL } from 'node:url';

export const JOBS_HYPERDRIVE_TARGET = Object.freeze({
  accountId: 'e5b7ae46e04698f507b7e4b3d4ef1af0',
  hyperdriveId: '442bb04b99004cb38c6974ec031d65ee',
  configName: 'lythaus-db-jobs-dev',
  worker: 'lythaus-jobs-development',
  binding: 'DB_JOBS_FRESH',
});

export async function inspectJobsHyperdriveOrigin({ token, fetchImpl = fetch }) {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('cloudflare_token_missing');
  }
  const target = JOBS_HYPERDRIVE_TARGET;
  const url = 'https://api.cloudflare.com/client/v4/accounts/'
    + target.accountId + '/hyperdrive/configs/' + target.hyperdriveId;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error('hyperdrive_read_transport_failed');
  }
  if (!response.ok) {
    const status = Number(response.status);
    const safeStatus = Number.isInteger(status) && status >= 100 && status <= 599
      ? String(status) : 'unknown';
    throw new Error('hyperdrive_read_http_' + safeStatus);
  }
  let envelope;
  try {
    envelope = await response.json();
  } catch {
    throw new Error('hyperdrive_read_invalid_json');
  }
  const config = envelope?.result;
  if (envelope?.success !== true
    || config?.id !== target.hyperdriveId
    || config?.name !== target.configName) {
    throw new Error('hyperdrive_target_not_verified');
  }
  const originUsername = config.origin?.user;
  if (typeof originUsername !== 'string'
    || !/^pscale_api_[a-z0-9]+\.[a-z0-9]+$/.test(originUsername)) {
    throw new Error('hyperdrive_origin_username_invalid');
  }
  return { ...target, originUsername };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const receipt = await inspectJobsHyperdriveOrigin({
      token: process.env.CLOUDFLARE_API_TOKEN,
    });
    process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
  } catch (error) {
    process.stderr.write('Jobs Hyperdrive origin diagnostic failed: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
