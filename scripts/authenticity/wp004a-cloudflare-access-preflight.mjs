import { runCloudflareModelSchemaPreflight } from '../../packages/authenticity/src/wp004a.ts';

function parseArgs(argv) {
  const options = { model: undefined, allowNetwork: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--model') options.model = String(argv[++index] ?? '');
    else if (argument === '--allow-network') options.allowNetwork = true;
    else throw new Error(`unknown_argument:${argument}`);
  }
  return options;
}

function safeError(error) {
  const message = error instanceof Error ? error.message : 'cloudflare_access_preflight_failed';
  return message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]').replace(/CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)[^\s]*/gi, 'CLOUDFLARE_CREDENTIAL_REDACTED').slice(0, 180);
}

try {
  const options = parseArgs(process.argv.slice(2));
  const result = await runCloudflareModelSchemaPreflight({
    model: options.model,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    allowNetwork: options.allowNetwork,
  });
  console.log(JSON.stringify(result));
  if (result.status !== 'SUCCESS') process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ schemaVersion: 'lythaus-cloudflare-model-schema-preflight-v1', status: 'FAILED', errorCategory: safeError(error) }));
  process.exitCode = 1;
}
