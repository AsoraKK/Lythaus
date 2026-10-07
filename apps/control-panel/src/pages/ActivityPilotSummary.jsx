import { useCallback, useEffect, useRef, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';
import LythCard from '../components/LythCard.jsx';
import LythButton from '../components/LythButton.jsx';
import { activityPilotEvidence, pilotLabels } from './activity-pilot.js';

export default function ActivityPilotSummary({ enabled = import.meta.env.VITE_ACTIVITY_MEASUREMENT_PILOT === 'true' }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());
  const revision = useRef(0);
  const load = useCallback(async () => {
    const operation = ++revision.current;
    setSnapshot(null); setError(null); setLoading(true);
    try {
      const result = await adminRequest('activity-measurement');
      activityPilotEvidence(result);
      if (operation !== revision.current) return;
      setSnapshot(result); setNow(Date.now());
    } catch (failure) {
      if (operation === revision.current) setError(failure?.status === 403 ? 'Current owner access is required.' : 'Pilot source is unavailable.');
    } finally {
      if (operation === revision.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (enabled) load();
    return () => { revision.current++; };
  }, [enabled, load]);
  const evidence = enabled && snapshot ? activityPilotEvidence(snapshot, now) : null;
  useEffect(() => {
    if (!evidence?.fresh) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, evidence.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [evidence?.fresh, evidence?.expiresAt]);
  return <LythCard variant="panel">
    <div className="panel-header"><h2>Account activity pilot</h2>
      {enabled ? <LythButton type="button" variant="ghost" onClick={load} disabled={loading}>Refresh pilot</LythButton> : null}
    </div>
    <p>Optional account-linked active UTC dates. These metrics describe continuously consenting accounts in each complete window. Public contributors use a separate source and population; no contributor-to-pilot ratio is available.</p>
    {!enabled ? <p>Pilot integration is disabled in this build. No measured pilot counts are available.</p> : null}
    {loading ? <p role="status">Loading pilot source…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {evidence ? <><p className="muted">Sampled {evidence.sampledAt} · {evidence.fresh ? 'Fresh' : 'Stale'} · Completed UTC days · 61-day retention</p><p>{evidence.population}</p></> : null}
    <div className="overview-grid">{Object.entries(pilotLabels).map(([key, label]) => <article className="overview-metric" key={key}>
      <h3>{label}</h3><strong className="kpi-value">{evidence?.metrics[key]?.text || 'Unavailable'}</strong>
      <p>{evidence?.metrics[key]?.explanation || 'No verified pilot source.'}</p>
      <details><summary>Definition and source</summary>
        <p>{key === 'quiet' ? 'Observed activity in the previous 30 complete UTC days and no observed activity in the latest 30, with continuous consent and verified coverage throughout all 60 days. This does not prove human inactivity.' : `At least one observed foreground render in the latest ${key === 'dau' ? 1 : key === 'wau' ? 7 : 30} complete UTC days. Includes an empty visible feed.`}</p>
        <p>Cohorts differ by window. Nonconsenting accounts, new consent episodes, missing coverage and pre-cutover history are excluded or unavailable.</p>
        {evidence ? <p>Window: {evidence.metrics[key].since} to {evidence.metrics[key].until} (end exclusive).</p> : null}
        <p className="overview-source">privacy.account_active_days · one account / UTC date · current active non-acceptance accounts</p>
      </details>
    </article>)}</div>
  </LythCard>;
}
