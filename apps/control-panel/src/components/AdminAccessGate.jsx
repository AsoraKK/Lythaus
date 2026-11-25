import { useEffect, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';

const isolatedOrigin = 'https://admin-new-core-test.lythaus.co';
const lookupStages = new Set(['subject_hmac', 'db_binding', 'db_connect', 'membership_query', 'db_close']);
const failureCategories = new Set([
  'invalid_binding', 'connection_failure', 'authentication_failed', 'permission_denied', 'missing_relation',
  'missing_column', 'query_canceled', 'unclassified', 'invalid_catalog', 'tls_verification_failed',
  'database_system_error', 'pool_acquire_failed', 'server_connection_refused', 'upstream_internal_error',
]);

function AdminAccessGate({ children }) {
  const [state, setState] = useState('loading');
  const [reference, setReference] = useState('');
  const [diagnostic, setDiagnostic] = useState(null);

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
          if (typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) {
            setReference(id);
            const details = error.payload.diagnostic;
            if (window.location.origin === isolatedOrigin && error.status === 500 && error.payload.error === 'admin_request_failed'
              && lookupStages.has(details?.stage) && failureCategories.has(details?.category)) {
              setDiagnostic({ stage: details.stage, category: details.category });
            }
          }
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
          {diagnostic && <p>Request stage <code>{diagnostic.stage}</code>. Failure category <code>{diagnostic.category}</code>.</p>}
          {reference && <p>Request reference <code>{reference}</code></p>}
        </div>
      </section>
    </main>
  );
}

export default AdminAccessGate;
