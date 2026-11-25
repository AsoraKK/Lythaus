import { TARGET } from './lythaus-new-core-isolation-review.mjs';

const query = `query AdminReadWindow($account: string!, $config: string!, $start: Time!, $end: Time!) {
  viewer { accounts(filter: {accountTag: $account}) {
    hyperdriveQueriesAdaptiveGroups(limit: 2, filter: {configId: $config, datetime_geq: $start, datetime_leq: $end}) {
      count dimensions { eventStatus }
    }
  } }
}`;
const variables = { account: TARGET.account, config: TARGET.hyperdrive,
  start: '2026-11-25T12:19:30Z', end: '2026-11-25T13:00:00Z' };

export async function readAdminHyperdriveMetrics(token, fetchImpl = fetch) {
  if (!token) return { status: 'credential_unavailable' };
  try {
    const response = await fetchImpl('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: 'http_error', httpStatus: response.status };
    }
    const payload = await response.json();
    if (payload.errors?.length) return { status: 'graphql_error' };
    const accounts = payload.data?.viewer?.accounts;
    const groups = accounts?.[0]?.hyperdriveQueriesAdaptiveGroups;
    if (!Array.isArray(accounts) || accounts.length !== 1 || !Array.isArray(groups) || groups.length > 2) {
      return { status: 'unexpected_response' };
    }
    const observed = new Set();
    const counts = { complete: 0, error: 0 };
    for (const group of groups) {
      const name = group?.dimensions?.eventStatus;
      if (!Object.hasOwn(counts, name) || observed.has(name) || !Number.isSafeInteger(group.count) || group.count < 0) {
        return { status: 'unexpected_response' };
      }
      observed.add(name);
      counts[name] = group.count;
    }
    return { status: groups.length ? 'observed' : 'no_samples', ...counts, from: variables.start, to: variables.end };
  } catch {
    return { status: 'request_unavailable' };
  }
}
