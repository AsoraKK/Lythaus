type DnsAnswer = { type?: number; data?: string };

export type MailboxProvider = 'google' | 'microsoft' | 'zoho';
const ZOHO_MX = new Set([
  'mx.zoho.com', 'mx2.zoho.com', 'mx3.zoho.com',
  'smtpin.zoho.com', 'smtpin2.zoho.com', 'smtpin3.zoho.com',
  'mx.zoho.eu', 'mx2.zoho.eu', 'mx3.zoho.eu',
  'mx.zoho.in', 'mx2.zoho.in', 'mx3.zoho.in',
  'smtpin.zoho.in', 'smtpin2.zoho.in', 'smtpin3.zoho.in',
  'mx.zoho.com.au', 'mx2.zoho.com.au', 'mx3.zoho.com.au',
  'mx.zoho.jp', 'mx2.zoho.jp', 'mx3.zoho.jp',
  'mx.zohocloud.ca', 'mx2.zohocloud.ca', 'mx3.zohocloud.ca',
]);

export function mailboxDomain(email: string): string {
  const match = /^[^@\s]+@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63})$/i.exec(email);
  if (!match || match[1].length > 253 || match[1].split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) throw new Error('acceptance_mailbox_invalid');
  return match[1].toLowerCase();
}

export function classifyMailboxMx(body: unknown): MailboxProvider {
  const result = body as { Status?: number; TC?: boolean; Answer?: DnsAnswer[] } | null;
  if (!result || result.Status !== 0 || result.TC === true || !Array.isArray(result.Answer)) throw new Error('acceptance_mailbox_provider_unknown');
  const providers = result.Answer.filter(answer => answer.type === 15).map(answer => {
    const record = /^(\d{1,5})\s+([a-z0-9.-]+)\.?$/i.exec(answer.data ?? '');
    if (!record || Number(record[1]) > 65535) throw new Error('acceptance_mailbox_provider_unknown');
    const host = record[2].replace(/\.$/, '').toLowerCase();
    if (ZOHO_MX.has(host)) return 'zoho';
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
      const reader = response.body?.getReader();
      if (!reader) throw new Error('unavailable');
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 32_768) throw new Error('oversized');
          chunks.push(part.value);
        }
      } finally { await reader.cancel(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return classifyMailboxMx(JSON.parse(new TextDecoder().decode(bytes)));
    } catch { throw new Error('acceptance_mailbox_provider_unknown'); }
  }));
  if (providers[0] === providers[1]) throw new Error('acceptance_second_mail_provider_required');
  return { source: 'dns_mx_observation', initial: providers[0], resend: providers[1], observedAt: new Date().toISOString() };
}
