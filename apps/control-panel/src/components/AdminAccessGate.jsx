import { useEffect, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';

function AdminAccessGate({ children }) {
  const [state, setState] = useState('loading');

  useEffect(() => {
    let active = true;
    adminRequest('health')
      .then(() => { if (active) setState('ready'); })
      .catch(() => { if (active) setState('denied'); });
    return () => { active = false; };
  }, []);

  if (state === 'loading') return <main className="main"><section className="page"><p>Checking administrator access...</p></section></main>;
  if (state === 'denied') return (
    <main className="main">
      <section className="page">
        <div className="notice error" role="alert">
          Administrator access is required to use the Lythaus control panel. Sign in through the configured Cloudflare Access application and try again.
        </div>
      </section>
    </main>
  );
  return children;
}

export default AdminAccessGate;
