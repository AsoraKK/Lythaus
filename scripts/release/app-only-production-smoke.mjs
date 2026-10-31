const TIMEOUT = 30000;

/** Fixed, read-only checks matching the canonical production surfaces. The
 * Jobs Worker has no public health route; its result records version evidence. */
export async function smokeAppOnlyProduction({ accessClientId, accessClientSecret, jobsProbe, workers, releaseSha, fetchImpl = fetch } = {}) {
  if (!accessClientId || !accessClientSecret || !/^[0-9a-f]{40}$/.test(releaseSha ?? '')
    || jobsProbe?.status !== 'pass' || jobsProbe.releaseSha !== releaseSha || !Array.isArray(jobsProbe.workers)
    || jobsProbe.workers.length !== 1 || jobsProbe.workers[0]?.worker !== workers?.jobs?.workerName
    || jobsProbe.workers[0]?.workerVersionId !== workers?.jobs?.versionId
    || jobsProbe.workers[0]?.sourceSha !== workers?.jobs?.sourceSha
    || jobsProbe.workers[0]?.readiness !== 'not_applicable_no_public_route') {
    throw new Error('app-only Jobs version evidence or smoke inputs invalid');
  }
  async function request(url, options = {}) {
    try { return await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT), ...options }); }
    catch { throw new Error('app-only production smoke request failed'); }
  }
  for (const host of ['lythaus.co', 'www.lythaus.co']) {
    const response = await request(`https://${host}/`);
    if (response.status !== 200 || !response.headers.get('strict-transport-security')
      || !response.headers.get('content-security-policy') || response.headers.get('x-content-type-options')?.toLowerCase() !== 'nosniff') {
      throw new Error('app-only public site smoke failed');
    }
    const body = await response.text();
    if (!body.includes('For the living internet.') || /asora/i.test(body)) throw new Error('app-only public site content smoke failed');
  }
  const web = await request('https://app.lythaus.co/');
  if (web.status !== 200) throw new Error('app-only web smoke failed');
  const publicApi = await request('https://api.lythaus.co/health');
  if (publicApi.status !== 200) throw new Error('app-only Public API smoke failed');
  const health = await publicApi.json();
  if (health?.status !== 'ok') throw new Error('app-only Public API health is invalid');
  const access = { 'CF-Access-Client-Id': accessClientId, 'CF-Access-Client-Secret': accessClientSecret };
  const adminApi = await request('https://admin-api.lythaus.co/health', { headers: access });
  if (adminApi.status !== 200) throw new Error('app-only Admin API smoke failed');
  const anonymousAdmin = await request('https://admin.lythaus.co/');
  if (![302, 401, 403].includes(anonymousAdmin.status)) throw new Error('app-only Admin access boundary smoke failed');
  const authorizedAdmin = await request('https://admin.lythaus.co/', { headers: access });
  if (authorizedAdmin.status !== 200 || !authorizedAdmin.headers.get('content-security-policy')) throw new Error('app-only Admin UI smoke failed');
  return Object.freeze({ marketing: 'PASS', www: 'PASS', flutter_web: 'PASS', public_api: 'PASS', admin_api: 'PASS', admin_ui: 'PASS',
    jobs: 'PASS', jobsEvidence: 'CAPTURED_VERSION_NO_PUBLIC_HEALTH_ROUTE' });
}
