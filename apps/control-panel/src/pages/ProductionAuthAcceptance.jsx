import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const base = '/api/admin/production-auth-acceptance';

async function coordinatorRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.code ?? 'acceptance_request_failed');
  return payload;
}

function TurnstileChallenge({ onToken, resetNonce }) {
  const host = useRef(null);
  const widget = useRef(null);
  const [siteKey, setSiteKey] = useState('');

  useEffect(() => {
    let live = true;
    coordinatorRequest('/turnstile').then((result) => {
      if (live) setSiteKey(result.siteKey ?? '');
    }).catch(() => { if (live) setSiteKey(''); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!siteKey || !host.current) return undefined;
    const render = () => {
      if (!window.turnstile || widget.current !== null) return;
      widget.current = window.turnstile.render(host.current, { sitekey: siteKey, action: 'account_signup', callback: onToken, 'expired-callback': () => onToken('') });
    };
    const existing = document.querySelector('script[data-lythaus-turnstile]');
    if (existing) render();
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.lythausTurnstile = 'true';
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => {
      if (widget.current !== null && window.turnstile?.remove) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, onToken, resetNonce]);

  return <div ref={host} aria-label="Production Turnstile challenge" />;
}

export default function ProductionAuthAcceptance() {
  const runId = useMemo(() => new URLSearchParams(window.location.search).get('run') ?? '', []);
  const [run, setRun] = useState(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('Complete each human step only after its real email is delivered.');
  const [busy, setBusy] = useState(false);
  const receiveTurnstile = useCallback((token) => setTurnstileToken(token), []);

  const refresh = useCallback(async () => {
    if (!runId) return;
    try { setRun(await coordinatorRequest(`/runs/${runId}`)); } catch (error) { setMessage(error.message); }
  }, [runId]);

  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 8000); return () => window.clearInterval(timer); }, [refresh]);

  const execute = async (path, body) => {
    setBusy(true);
    try {
      const result = await coordinatorRequest(`/runs/${runId}/${path}`, { method: 'POST', body });
      setMessage(result.state ?? 'Step recorded.');
      setTurnstileToken('');
      if (['register', 'resend', 'reset'].includes(path)) setTurnstileResetNonce((value) => value + 1);
      if (['register', 'initial-session', 'session-proof'].includes(path)) setPassword('');
      if (path === 'session-proof') setNewPassword('');
      await refresh();
    } catch (error) {
      setMessage(error.message);
      if (['register', 'resend', 'reset'].includes(path)) {
        setTurnstileToken('');
        setTurnstileResetNonce((value) => value + 1);
      }
    }
    finally { setBusy(false); }
  };

  if (!runId) return <section className="page"><div className="notice error">A protected acceptance-run URL is required.</div></section>;
  const complete = new Set(run?.events?.map((event) => event.type) ?? []);
  const emailLifecycle = run?.emailLifecycle ?? [];
  return (
    <section className="page">
      <div className="page-header"><h1>Production Auth Acceptance</h1><p className="page-subtitle">Exact-candidate, human-only production evidence. Passwords and tokens are never retained by this screen.</p></div>
      <div className="card"><dl className="key-value-list"><dt>Release SHA</dt><dd>{run?.releaseSha ?? 'Loading…'}</dd><dt>Candidate Worker</dt><dd>{run?.candidate?.workerVersionId ?? 'Loading…'}</dd><dt>Acceptance run</dt><dd>{runId}</dd><dt>Expires</dt><dd>{run?.expiresAt ?? 'Loading…'}</dd></dl></div>
      <div className="notice" role="status">{message}</div>
      <div className="card"><h2>Real Turnstile</h2><p>Complete a fresh challenge immediately before registration, resend, or reset.</p><TurnstileChallenge onToken={receiveTurnstile} resetNonce={turnstileResetNonce} /><p>{turnstileToken ? 'Challenge token ready; the staged candidate verifies it with the next request.' : 'Challenge pending.'}</p></div>
      <div className="card"><h2>1. Register and verify</h2><label>Password <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="15" maxLength="128" autoComplete="new-password" /></label><button disabled={busy || !turnstileToken || password.length < 15 || complete.has('account_created')} onClick={() => execute('register', { password, turnstileToken })}>Request real verification email</button><p>{complete.has('initial_verification_completed') ? 'Verification and replay rejection recorded.' : 'Open the delivered verification email only after it arrives.'}</p></div>
      <div className="card"><h2>2. Prove the initial session</h2><p>After verification, sign in once through the staged candidate. Only a short-lived encrypted refresh value is retained until reset proves it is revoked.</p><label>Verified-account password <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="15" maxLength="128" autoComplete="current-password" /></label><button disabled={busy || !complete.has('initial_verification_completed') || password.length < 15 || complete.has('refresh_completed')} onClick={() => execute('initial-session', { password })}>Prove candidate sign-in and refresh</button></div>
      <div className="card"><h2>3. Resend fixture</h2><button disabled={busy || !turnstileToken || !complete.has('initial_verification_completed') || complete.has('resend_requested')} onClick={() => execute('resend', { turnstileToken })}>Request real resend-verification email</button><p>{complete.has('resend_verification_completed') ? 'Resend verification and replay rejection recorded.' : 'Use the distinct delivered resend email when it arrives.'}</p></div>
      <div className="card"><h2>4. Reset password</h2><button disabled={busy || !turnstileToken || !complete.has('refresh_completed') || complete.has('password_reset_requested')} onClick={() => execute('reset', { turnstileToken })}>Request real reset email</button><p>Open the reset link from the delivered email, then return here.</p><label>Previous password <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label><label>New password <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength="15" maxLength="128" autoComplete="new-password" /></label><button disabled={busy || !complete.has('password_reset_completed') || password.length < 15 || newPassword.length < 15 || complete.has('logout_completed')} onClick={() => execute('session-proof', { oldPassword: password, newPassword })}>Prove revocation, new-password sign-in, and logout</button></div>
      <div className="card"><h2>Status</h2><p>Turnstile: {run?.turnstile?.status ?? 'Loading…'}</p><h3>Email lifecycle</h3><ul>{emailLifecycle.map((item) => <li key={`${item.purpose}-${item.state}`}>{item.purpose}: {item.state}; queued {item.queuedCount}, accepted {item.acceptedCount}, delivered {item.deliveredCount}</li>)}</ul><h3>Acceptance events</h3><ul>{run?.events?.map((event) => <li key={event.type}>{event.type}: {event.occurredAt}</li>)}</ul></div>
    </section>
  );
}
