import { pathToFileURL } from 'node:url';

const HISTORY_URL = 'https://api.cloudflare.com/client/v4/accounts/'
  + 'e5b7ae46e04698f507b7e4b3d4ef1af0/billing/history?page=1&per_page=20';
const MAX_BODY_BYTES = 1024 * 1024;
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
const LIMITATIONS = Object.freeze([
  'Only the first page (up to 20 items) is inspected; ordering and completeness are not established.',
  'A PlanetScale mention in a charge description is not verified database attribution. Historical amounts are not unit prices and must not be summed.',
  'Billing periods, finalization, tax inclusion and tax rates are not established by the documented history fields.',
  'PlanetScale usage is billed through Cloudflare as period totals at standard PlanetScale pricing. History cannot quote a prospective restore or certify an all-inclusive US$1 ceiling.',
  'Token names and successful token verification do not prove Billing Read; only this endpoint is checked.',
]);

function receipt(access, limitation) {
  return {
    access,
    currencies: [],
    planetscaleMentionedCharges: [],
    taxEvidence: 'not_available_from_documented_history_fields',
    limitations: limitation ? [limitation, ...LIMITATIONS] : [...LIMITATIONS],
  };
}

function currencyOf(item) {
  if (typeof item?.currency !== 'string') return null;
  const currency = item.currency.toUpperCase();
  return CURRENCIES.has(currency) ? currency : null;
}

async function readEnvelope(response) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > MAX_BODY_BYTES) throw new Error('billing_response_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}

export async function inspectBillingHistory({ token, fetchImpl = fetch }) {
  if (typeof token !== 'string' || token.trim().length === 0 || /[\r\n]/.test(token)) {
    return receipt('not_attempted', 'The existing token binding is missing or invalid; no request was made.');
  }
  let response;
  try {
    response = await fetchImpl(HISTORY_URL, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return receipt('unknown', 'Transport, timeout or redirect failure; no retry or alternate endpoint was attempted.');
  }
  if (response.status === 401 || response.status === 403) {
    return receipt('denied', 'Billing history access was denied; the response body was not read and no retry was attempted.');
  }
  if (!response.ok) {
    return receipt('unknown', 'The HTTP response did not establish billing access; its body was not read and no retry was attempted.');
  }
  let envelope;
  try {
    envelope = await readEnvelope(response);
  } catch {
    return receipt('unknown', 'The response was invalid or exceeded the size limit; provider content is omitted.');
  }
  if (envelope?.success !== true || !Array.isArray(envelope.result) || envelope.result.length > 20) {
    return receipt('unknown', 'The API response did not match the bounded successful history contract; provider content is omitted.');
  }
  const result = receipt('success');
  result.currencies = [...new Set(envelope.result.map(currencyOf).filter(Boolean))].sort();
  for (const item of envelope.result) {
    const currency = currencyOf(item);
    if (item?.type !== 'charge' || !currency || typeof item.description !== 'string'
      || item.description.length > 4096 || !/\bplanetscale\b/i.test(item.description)
      || typeof item.amount !== 'number' || !Number.isFinite(item.amount)) continue;
    result.planetscaleMentionedCharges.push({ currency, amount: item.amount });
    if (result.planetscaleMentionedCharges.length === 3) break;
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try {
    result = await inspectBillingHistory({ token: process.env.CLOUDFLARE_API_TOKEN });
  } catch {
    result = receipt('unknown', 'The diagnostic failed locally; no access conclusion can be drawn.');
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.access === 'success' ? 0 : 1;
}
