import { JOBS_SESSION_PATH, JOBS_WORKER_NAME, JOBS_SESSION_BRIDGE_TIMEOUT_MS,
  JOBS_SESSION_RECEIPT_BYTES, jobsSessionResponse, jobsVersionOverride,
  safeWorkerVersion, sanitizedJobsSessionReceipt,
} from '../../../packages/contracts/src/jobs-reputation-session.ts';

interface BridgeEnv {
  JOBS_COMPATIBILITY: { fetch(input: string, init?: RequestInit): Promise<Response> };
  WORKER_VERSION?: { id?: string; tag?: string };
  JOBS_REPUTATION_SESSION_DIAGNOSTIC_ENABLED?: string;
}
export async function handleJobsReputationSessionBridge(
  request: Request, env: BridgeEnv, authorized: boolean,
  timeoutMs = JOBS_SESSION_BRIDGE_TIMEOUT_MS,
): Promise<Response> {
  if (!authorized || env.JOBS_REPUTATION_SESSION_DIAGNOSTIC_ENABLED !== 'true'
    || request.method !== 'GET' || request.signal.aborted) return new Response(null, { status: 404 });
  const url = new URL(request.url);
  if (![JOBS_SESSION_PATH, '/api' + JOBS_SESSION_PATH].includes(url.pathname) || url.search) {
    return jobsSessionResponse({ error: 'diagnostic_request_invalid' }, 400);
  }
  const publicVersion = safeWorkerVersion(env.WORKER_VERSION);
  const expectedJobsVersion = jobsVersionOverride(request.headers.get('Cloudflare-Workers-Version-Overrides'));
  if (!publicVersion || !expectedJobsVersion) return jobsSessionResponse({ error: 'diagnostic_version_unavailable' }, 409);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  try {
    const work = async () => {
      const response = await env.JOBS_COMPATIBILITY.fetch('https://lythaus-jobs.internal' + JOBS_SESSION_PATH, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { authorization: request.headers.get('authorization') ?? '', accept: 'application/json',
          'Cloudflare-Workers-Version-Overrides': `${JOBS_WORKER_NAME}="${expectedJobsVersion}"` },
      });
      if (controller.signal.aborted) throw new Error('diagnostic_aborted');
      if (![200, 503].includes(response.status)
        || response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json'
        || !response.body) throw new Error('invalid_receipt');
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (controller.signal.aborted) throw new Error('diagnostic_aborted');
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > JOBS_SESSION_RECEIPT_BYTES) throw new Error('invalid_receipt');
        chunks.push(chunk.value);
      }
      const data = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)) as Record<string, unknown>;
      const jobsVersion = safeWorkerVersion({ id: body.workerVersionId, tag: body.releaseTag });
      const receipt = sanitizedJobsSessionReceipt(body.receipt);
      if (body.service !== 'lythaus-jobs' || !jobsVersion || jobsVersion.id !== expectedJobsVersion
        || !receipt || (response.status === 200) !== (receipt.status === 'observed')) throw new Error('invalid_receipt');
      return jobsSessionResponse({ service: 'lythaus-public-api', publicWorkerVersionId: publicVersion.id,
        publicReleaseTag: publicVersion.tag, jobsWorkerVersionId: jobsVersion.id,
        jobsReleaseTag: jobsVersion.tag, receipt }, response.status);
    };
    return await Promise.race([work(), new Promise<Response>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(jobsSessionResponse({ error: 'diagnostic_timeout' }, 504)); }, timeoutMs);
    })]);
  } catch {
    return jobsSessionResponse({ error: 'diagnostic_unavailable' }, 503);
  } finally {
    clearTimeout(timer);
    controller.abort();
    request.signal.removeEventListener('abort', abort);
    void reader?.cancel().catch(() => undefined);
  }
}
