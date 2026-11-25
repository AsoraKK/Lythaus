import { useEffect, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';

function AdminAccessGate({ children }) {
  const [state, setState] = useState('loading');
  const [reference, setReference] = useState('');

  useEffect(() => {
    let active = true;
    adminRequest('health')
      .then((health) => {
        if (active) setState(health?.status === 'ok' ? 'ready' : 'unavailable');
      })
      .catch((error) => {
        if (!active) return;
        if (error?.status === 403 && error.payload?.error === 'admin_role_required') {
          setState('nonmember');
        } else if (error?.status === 401 || error?.status === 403) {
          setState('denied');
        } else {
          const id = error?.payload?.correlationId;
          if (typeof id === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) setReference(id);
          setState('unavailable');
        }
      });
    return () => { active = false; };
  }, []);

  if (state === 'loading') return <main className="main"><section className="page"><p>Checking administrator access...</p></section></main>;
  if (state === 'ready') return children;
  return (
    <main className="main">
      <section className="page">
        <div className="notice error" role="alert">
          {state === 'denied' && 'Administrator access is required to use the Lythaus control panel. Sign in through the configured Cloudflare Access application and try again.'}
          {state === 'nonmember' && 'This account has no active administrator membership.'}
          {state === 'unavailable' && 'The Admin service could not verify access. Contact the Lythaus operator.'}
          {reference && <p>Request reference <code>{reference}</code></p>}
        </div>
      </section>
    </main>
  );
}

export default AdminAccessGate;
