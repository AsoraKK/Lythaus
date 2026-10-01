import { requirePasswordInput } from '@lythaus/contracts';

export async function requireUncompromisedPassword(
  input: unknown,
  fetcher: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<string> {
  const password = requirePasswordInput(input, 'creation');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const compromised = await Promise.race([
      (async () => {
        const response = await fetcher(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
          method: 'GET', redirect: 'error', signal: controller.signal,
          headers: { 'Add-Padding': 'true', 'User-Agent': 'Lythaus-password-screening' },
        });
        if (!response.ok) throw new Error('password_screening_unavailable');
        const reader = response.body?.getReader();
        if (!reader) throw new Error('password_screening_unavailable');
        const decoder = new TextDecoder();
        let data = '';
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          data += decoder.decode(chunk.value, { stream: true });
          if (data.length > 256 * 1024) { await reader.cancel(); throw new Error('password_screening_unavailable'); }
        }
        data += decoder.decode();
        const lines = data.trim().split(/\r?\n/);
        if (!lines.length || lines.some(line => !/^[A-F0-9]{35}:\d{1,12}$/.test(line))) throw new Error('password_screening_unavailable');
        return lines.some(line => line.slice(0, 35) === hash.slice(5) && Number(line.slice(36)) > 0);
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('password_screening_unavailable')), timeoutMs); }),
    ]);
    if (compromised) throw new Error('password_compromised');
    return password;
  } catch (error) {
    if (error instanceof Error && error.message === 'password_compromised') throw error;
    throw new Error('password_screening_unavailable');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
