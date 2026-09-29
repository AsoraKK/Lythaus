import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requirePasswordInput } from '../../../../packages/contracts/src/password-policy.ts';

function validPassword(value, purpose) {
  try { requirePasswordInput(value, purpose); return true; } catch { return false; }
}

const base = '/api/admin/production-auth-acceptance';

async function coordinatorRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
    headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.code ?? 'acceptance_request_failed');
  return payload;
}

export function TurnstileChallenge({ onToken, resetNonce, action }) {
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
    let live = true;
    onToken('');
    const render = () => {
      if (!live || !window.turnstile || widget.current !== null) return;
      widget.current = window.turnstile.render(host.current, { sitekey: siteKey, action, callback: token => { if (live) onToken(token); }, 'expired-callback': () => { if (live) onToken(''); }, 'error-callback': () => { if (live) onToken(''); } });
    };
    let script = document.querySelector('script[data-lythaus-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.lythausTurnstile = 'true';
      document.head.appendChild(script);
    }
    script.addEventListener('load', render);
    render();
    return () => {
      live = false;
      script.removeEventListener('load', render);
      if (widget.current !== null && window.turnstile?.remove) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, onToken, resetNonce, action]);

  return <div ref={host} aria-label="Production Turnstile challenge" />;
}

export default function ProductionAuthAcceptance() {
  const runId = useMemo(() => new URLSearchParams(window.location.search).get('run') ?? '', []);
  const [run, setRun] = useState(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);
  const [challengeAction, setChallengeAction] = useState('account_signup');
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
    const actionFor = { register: 'account_signup', resend: 'verification_resend', reset: 'password_reset_request' };
    if (actionFor[path] && actionFor[path] !== challengeAction) {
      setMessage('Select the matching challenge operation before continuing.');
      return;
    }
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
      <div className="card"><h2>Real Turnstile</h2><p>Select the operation, then complete a fresh challenge immediately before its request.</p><label>Challenge operation <select value={challengeAction} disabled={busy} onChange={event => { setTurnstileToken(''); setChallengeAction(event.target.value); }}><option value="account_signup">Registration</option><option value="verification_resend">Resend verification</option><option value="password_reset_request">Password reset</option></select></label><TurnstileChallenge onToken={receiveTurnstile} resetNonce={turnstileResetNonce} action={challengeAction} /><p>{turnstileToken ? 'Challenge token ready; the staged candidate verifies it with the next request.' : 'Challenge pending.'}</p></div>
      <div className="card"><h2>1. Register and verify</h2><label>Password <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength="256" autoComplete="new-password" /></label><button disabled={busy || !turnstileToken || !validPassword(password, 'creation') || complete.has('account_created')} onClick={() => execute('register', { password, turnstileToken })}>Request real verification email</button><p>{complete.has('initial_verification_completed') ? 'Verification and replay rejection recorded.' : 'Open the delivered verification email only after it arrives.'}</p></div>
      <div className="card"><h2>2. Prove the initial session</h2><p>After verification, sign in once through the staged candidate. Only a short-lived encrypted refresh value is retained until reset proves it is revoked.</p><label>Verified-account password <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength="256" autoComplete="current-password" /></label><button disabled={busy || !complete.has('initial_verification_completed') || !validPassword(password, 'login') || complete.has('refresh_completed')} onClick={() => execute('initial-session', { password })}>Prove candidate sign-in and refresh</button></div>
      <div className="card"><h2>3. Resend fixture</h2><button disabled={busy || !turnstileToken || !complete.has('initial_verification_completed') || complete.has('resend_requested')} onClick={() => execute('resend', { turnstileToken })}>Request real resend-verification email</button><p>{complete.has('resend_verification_completed') ? 'Resend verification and replay rejection recorded.' : 'Use the distinct delivered resend email when it arrives.'}</p></div>
      <div className="card"><h2>4. Reset password</h2><button disabled={busy || !turnstileToken || !complete.has('refresh_completed') || complete.has('password_reset_requested')} onClick={() => execute('reset', { turnstileToken })}>Request real reset email</button><p>Open the reset link from the delivered email, then return here.</p><label>Previous password <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label><label>New password <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} maxLength="256" autoComplete="new-password" /></label><button disabled={busy || !complete.has('password_reset_completed') || !validPassword(password, 'login') || !validPassword(newPassword, 'creation') || complete.has('logout_completed')} onClick={() => execute('session-proof', { oldPassword: password, newPassword })}>Prove revocation, new-password sign-in, and logout</button></div>
      <div className="card"><h2>Status</h2><p>Turnstile: {run?.turnstile?.status ?? 'Loading…'}</p><h3>Email lifecycle</h3><ul>{emailLifecycle.map((item) => <li key={`${item.purpose}-${item.state}`}>{item.purpose}: {item.state}; queued {item.queuedCount}, accepted {item.acceptedCount}, delivered {item.deliveredCount}</li>)}</ul><h3>Acceptance events</h3><ul>{run?.events?.map((event) => <li key={event.type}>{event.type}: {event.occurredAt}</li>)}</ul></div>
    </section>
  );
}
