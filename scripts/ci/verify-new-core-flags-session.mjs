import {pathToFileURL} from 'node:url';

const hosts = new Set(['admin-new-core-test.lythaus.co', 'control.lythaus.co']);
const versionPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function validateCandidate({hostname,versionId,sourceSha}) {
  if (!hosts.has(hostname) || !versionPattern.test(versionId) || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    throw new Error('flags_candidate_identity_required');
  }
}

export async function verifyFlagsSession(page, {hostname, versionId, sourceSha}) {
  validateCandidate({hostname,versionId,sourceSha});
  const origin = 'https://' + hostname;
  const pageUrl = origin + '/flags';
  const apiUrl = origin + '/api/admin/moderation/cases';
  if (page.url() !== pageUrl) throw new Error('flags_owner_navigation_required');
  const pending = page.waitForResponse(response => response.url() === apiUrl
    && response.request().method() === 'GET' && response.frame() === page.mainFrame(), {timeout:30000});
  const [api, document] = await Promise.all([pending, page.reload({waitUntil:'domcontentloaded'})]);
  async function exactResponse(response, url, mediaType) {
    if (!response || response.url() !== url || response.status() !== 200 || response.fromServiceWorker()
      || response.request().redirectedFrom() || response.request().frame() !== page.mainFrame()
      || (await response.headerValue('content-type'))?.split(';')[0].trim().toLowerCase() !== mediaType
      || await response.headerValue('x-lythaus-worker-version') !== versionId
      || await response.headerValue('x-lythaus-source-sha') !== sourceSha) {
      throw new Error('flags_serving_response_mismatch');
    }
  }
  await exactResponse(document, pageUrl, 'text/html');
  await exactResponse(api, apiUrl, 'application/json');
  let data;
  try { data = await api.json(); } catch { throw new Error('flags_invalid_json'); }
  if (!Array.isArray(data?.items) || !data.items.every(row =>
    typeof row?.id === 'string' && row.id.length > 0 && typeof row.state === 'string')) {
    throw new Error('flags_cases_contract_mismatch');
  }
  await page.getByRole('heading', {name:'Moderation cases', exact:true}).waitFor({state:'visible'});
  await page.getByRole('heading', {name:'Cases', exact:true}).waitFor({state:'visible'});
  if (page.url() !== pageUrl || await page.locator('.notice.error:visible').count()) throw new Error('flags_ui_failed');
  return {hostname, versionId, sourceSha, renderedFlags:true, sameOriginCasesJson:true, apiStatus:200};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let browser;
  try {
    const [hostname,versionId,sourceSha] = process.argv.slice(2);
    validateCandidate({hostname,versionId,sourceSha});
    const flags = 'https://' + hostname + '/flags';
    const {chromium} = await import('playwright');
    browser = await chromium.launch({headless:false});
    const context = await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
    const page = await context.newPage();
    const challenged = page.waitForResponse(async response => {
      if (response.url() !== flags || ![302,303,307].includes(response.status())
        || !response.request().isNavigationRequest() || response.frame() !== page.mainFrame()) return false;
      try {
        const location = new URL(await response.headerValue('location'),flags);
        return location.origin === 'https://asorateam.cloudflareaccess.com' && location.pathname.startsWith('/cdn-cgi/access/login/');
      } catch { return false; }
    });
    await Promise.all([challenged,page.goto(flags,{waitUntil:'commit'})]);
    console.log('Complete Cloudflare Access sign-in in the opened browser.');
    await page.waitForURL(flags,{timeout:300000});
    await page.getByRole('heading',{name:'Moderation cases',exact:true}).waitFor({state:'visible',timeout:30000});
    console.log(JSON.stringify({...await verifyFlagsSession(page,{hostname,versionId,sourceSha}),freshAccessChallenge:true}));
  } catch {
    console.error('Fresh owner flags acceptance was not verified.');
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}
