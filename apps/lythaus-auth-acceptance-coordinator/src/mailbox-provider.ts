type DnsAnswer = { type?: number; data?: string };

export function mailboxDomain(email: string): string {
  const match = /^[^@\s]+@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63})$/i.exec(email);
  if (!match || match[1].includes('..') || match[1].length > 253) throw new Error('acceptance_mailbox_invalid');
  return match[1].toLowerCase();
}

export function classifyMailboxMx(body: unknown): 'google' | 'microsoft' {
  const result = body as { Status?: number; TC?: boolean; Answer?: DnsAnswer[] } | null;
  if (!result || result.Status !== 0 || result.TC === true || !Array.isArray(result.Answer)) throw new Error('acceptance_mailbox_provider_unknown');
  const providers = result.Answer.filter(answer => answer.type === 15).map(answer => {
    const host = /^\d+\s+([a-z0-9.-]+)\.?$/i.exec(answer.data ?? '')?.[1].replace(/\.$/, '').toLowerCase();
    if (host === 'smtp.google.com' || host?.endsWith('.aspmx.l.google.com') || host === 'aspmx.l.google.com' || host?.endsWith('.aspmx.googlemail.com')) return 'google';
    if (host?.endsWith('.protection.outlook.com')) return 'microsoft';
    throw new Error('acceptance_mailbox_provider_unknown');
  });
  if (providers.length === 0 || new Set(providers).size !== 1) throw new Error('acceptance_mailbox_provider_unknown');
  return providers[0];
}

export async function observeMailboxProviders(primary: string, resend: string) {
  const domains = [mailboxDomain(primary), mailboxDomain(resend)];
  if (domains[0] === domains[1]) throw new Error('acceptance_second_mail_provider_required');
  const providers = await Promise.all(domains.map(async domain => {
    let response: Response;
    try {
      response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
        headers: { accept: 'application/dns-json' }, redirect: 'error', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('unavailable');
      return classifyMailboxMx(await response.json());
    } catch { throw new Error('acceptance_mailbox_provider_unknown'); }
  }));
  if (providers[0] === providers[1]) throw new Error('acceptance_second_mail_provider_required');
  return { source: 'dns_mx_observation', initial: providers[0], resend: providers[1], observedAt: new Date().toISOString() };
}
