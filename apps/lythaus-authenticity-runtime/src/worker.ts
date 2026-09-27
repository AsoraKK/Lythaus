import { Container } from '@cloudflare/containers';

interface RuntimeEnv {
  AUTHENTICITY_BETA_DISPATCH_SECRET: string;
  AUTHENTICITY_BETA_ENABLED: string;
  RUNTIME_DIGEST: string;
}

export class SafeBetaContainer extends Container<RuntimeEnv> {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = '30s';
  enableInternet = false;
  envVars = { AUTHENTICITY_BETA_DISPATCH_SECRET: this.env.AUTHENTICITY_BETA_DISPATCH_SECRET, RUNTIME_DIGEST: this.env.RUNTIME_DIGEST };

  override async fetch(request: Request): Promise<Response> {
    const supplied = request.headers.get('authorization');
    const expected = `Bearer ${this.env.AUTHENTICITY_BETA_DISPATCH_SECRET}`;
    if (this.env.AUTHENTICITY_BETA_ENABLED !== 'true' || !this.env.AUTHENTICITY_BETA_DISPATCH_SECRET || !supplied || supplied.length !== expected.length) return new Response(null,{status:404});
    let difference = 0;
    for (let index=0; index<expected.length; index++) difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
    if (difference || new URL(request.url).pathname !== '/infer' || request.method !== 'POST') return new Response(null,{status:404});
    await this.startAndWaitForPorts();
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const readiness = await this.containerFetch(new Request('http://safe/ready'));
      if (readiness.ok) return this.containerFetch(request);
      await new Promise(resolve => setTimeout(resolve, 1_000));
    }
    return Response.json({error:'beta_startup_timeout'},{status:503,headers:{'cache-control':'no-store'}});
  }

  override onError(): void { throw new Error('beta_container_unavailable'); }
}

export default {
  fetch(): Response { return new Response(null,{status:404}); },
};
