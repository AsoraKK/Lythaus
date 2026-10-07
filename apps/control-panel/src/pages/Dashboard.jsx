import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminRequest } from '../api/adminApi.js';
import PageLayout from '../components/PageLayout.jsx';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';
import { overviewActivityEvidence } from './overview-activity.js';
import ActivityPilotSummary from './ActivityPilotSummary.jsx';
import './overview.css';

const GUIDE = {
  title: 'Read the sources with the numbers',
  summary: 'Community metrics describe retained records at the sample time. Stored visibility, moderation and deletion changes can revise earlier periods. Content counts include nonactive authors and do not measure feed delivery.',
  items: ['Choose Today, month to date or year to date in UTC.', 'Compare only matching elapsed windows; a shorter prior calendar period has no comparison.',
    'Open a metric definition to see its population, source and exclusions.', 'Queue figures describe the loaded page, not an entire backlog.',
    'Unavailable and stale data remain unknown. Traffic requests are not users; entitlements are not revenue.'],
  footnote: 'Community aggregates require current active owner access. Refresh after a sample becomes stale.'
};
const COMMUNITY = { posts: 'Posts', comments: 'Comments', commentsPerPost: 'Comments per new post', unansweredPosts: 'Unanswered posts',
  uniqueContributors: 'Unique contributors', newRegistrations: 'New registered account records' };
const SUBSCRIPTIONS = { subscriptionsFree: 'Free', subscriptionsPremium: 'Premium', subscriptionsBlack: 'Black' };
const GAP_LABELS = { newVerifiedUsers: 'New verified users', returningUsers: 'Returning users', retentionRate: 'Retention', quietUsers: 'Quiet users',
  upgrades: 'Paid upgrades', cancellations: 'Cancellations', revenue: 'Revenue', suspectedAiFlags: 'Suspected AI flags',
  confirmedAiClassifications: 'Confirmed AI classifications', appealOutcomes: 'Appeal outcomes' };
const timestamp = value => value !== null && value !== undefined && Number.isFinite(new Date(value).getTime()) ? `${new Date(value).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC` : 'Unavailable';
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const format = (value, unit) => number(value) === null ? 'Unavailable' : value.toLocaleString('en-GB', { maximumFractionDigits: unit === 'ratio' ? 2 : 0 });
const pageCount = (response, predicate = () => true) => Array.isArray(response?.items) ? response.items.filter(predicate).length : null;
const calendarStart = (period, at) => {
  const date = new Date(at);
  date.setUTCHours(0, 0, 0, 0);
  if (period === 'mtd') date.setUTCDate(1);
  if (period === 'ytd') date.setUTCMonth(0, 1);
  return date.getTime();
};
const calendarEnd = (period, at) => {
  const date = new Date(calendarStart(period, at));
  if (period === 'today') date.setUTCDate(date.getUTCDate() + 1);
  if (period === 'mtd') date.setUTCMonth(date.getUTCMonth() + 1);
  if (period === 'ytd') date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.getTime();
};

function Metric({ label, metric, fresh, comparable }) {
  const value = fresh && metric?.availability === 'available' ? number(metric.value) : null;
  const previous = value !== null && comparable ? number(metric.previous) : null;
  return <article className="overview-metric">
    <h3>{label}</h3>
    <strong className="kpi-value">{format(value, metric?.unit)}</strong>
    <p className="muted">{value === null ? !fresh ? 'No fresh sample' : metric?.reason === 'snapshot_row_limit' ? 'Snapshot capacity exceeded' : 'No measured value' : previous === null ? 'No comparable prior value' : `Prior elapsed period: ${format(previous, metric?.unit)}`}</p>
    {previous !== null && typeof metric?.changePercent === 'number' && Number.isFinite(metric.changePercent) ? <p className="muted">Change: {metric.changePercent.toFixed(1)}%</p> : null}
    <details><summary>Definition and source</summary><p>{metric?.definition || 'Source definition unavailable.'}</p><p className="overview-source">{metric?.source || 'Source unavailable'}</p></details>
  </article>;
}

function Dashboard() {
  const [period, setPeriod] = useState('today');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [communityError, setCommunityError] = useState('');
  const [expired, setExpired] = useState(false);
  const [operationsExpired, setOperationsExpired] = useState(true);
  const version = useRef(0);

  const loadSnapshot = useCallback(async () => {
    const token = ++version.current;
    setLoading(true); setSnapshot(null); setOperationsExpired(true); setError(''); setCommunityError('');
    const fetchedAt = Date.now();
    const paths = ['health', 'auth/summary', 'email-health', 'moderation/cases', 'appeals/pending-adjudication', 'audit', 'overview'];
    const results = await Promise.allSettled(paths.map(path => path === 'overview' ? adminRequest(path, { query: { period } }) : adminRequest(path)));
    if (token !== version.current) return;
    const data = index => results[index].status === 'fulfilled' ? results[index].value : null;
    if (results.some(result => result.status === 'rejected' && result.reason?.status === 401)
      || (results[0].status === 'rejected' && results[0].reason?.status === 403)) {
      setError('Administrator access must be checked again. Reload the control panel.'); setLoading(false); return;
    }
    const community = data(6);
    const valid = community?.contractVersion === 'overview-v1' && community.period === period && community.timezone === 'UTC';
    if (!valid) setCommunityError(results[6].status === 'rejected' && results[6].reason?.status === 403
      ? 'Current active owner access is required for community metrics.' : 'Community metrics are unavailable. Refresh to retry.');
    if (results.slice(0, 6).some(result => result.status === 'rejected')) setError('Some operational sources are unavailable. Available sources are shown below.');
    setSnapshot({ fetchedAt, health: data(0)?.status || 'Unknown', databaseTime: data(0)?.database?.database_time,
      accounts: data(1)?.accounts || {}, waitlist: data(1)?.waitlist || {}, email: data(2) || {},
      openCases: pageCount(data(3), item => item.state === 'open'), appeals: pageCount(data(4)), audit: pageCount(data(5)),
      community: valid ? community : null });
    const operationsAge = Date.now() - fetchedAt;
    setOperationsExpired(operationsAge < 0 || operationsAge >= 60000); setLoading(false);
  }, [period]);

  useEffect(() => { loadSnapshot(); return () => { version.current += 1; }; }, [loadSnapshot]);
  const community = snapshot?.community;
  useEffect(() => {
    if (snapshot) {
      const remaining = 60000 - (Date.now() - snapshot.fetchedAt);
      setOperationsExpired(remaining <= 0 || remaining > 60000);
      const timer = setTimeout(() => setOperationsExpired(true), Math.max(0, Math.min(60000, remaining)));
      return () => clearTimeout(timer);
    }
  }, [snapshot]);
  useEffect(() => {
    const sampleAt = Date.parse(community?.sampledAt);
    const remaining = Math.min(65000 - (Date.now() - sampleAt), calendarEnd(period, sampleAt) - Date.now());
    setExpired(!Number.isFinite(remaining) || remaining <= 0);
    if (Number.isFinite(remaining) && remaining > 0) {
      const timer = setTimeout(() => setExpired(true), remaining);
      return () => clearTimeout(timer);
    }
  }, [community, period]);
  const age = community ? Date.now() - Date.parse(community.sampledAt) : NaN;
  const fresh = !expired && Number.isFinite(age) && age >= -5000 && age <= 65000 && community.cacheTtlSeconds === 60
    && Date.parse(community.current?.start) === calendarStart(period, Date.now());
  const operationsAge = Date.now() - snapshot?.fetchedAt;
  const operational = !operationsExpired && operationsAge >= 0 && operationsAge < 60000 ? snapshot : null;
  const activity = overviewActivityEvidence(community, fresh, period);

  return <PageLayout title="Overview" subtitle="Community health, account entitlements and operational sources." guide={GUIDE} className="overview">
    <LythCard variant="panel">
      <div className="panel-header"><h2>Community health</h2><div className="overview-controls">
        <label className="field"><span className="field-label">Reporting period (UTC)</span><select value={period} onChange={event => setPeriod(event.target.value)}>
          <option value="today">Today</option><option value="mtd">Month to date</option><option value="ytd">Year to date</option>
        </select></label><LythButton variant="ghost" type="button" onClick={loadSnapshot} disabled={loading}>Refresh</LythButton>
      </div></div>
      {loading ? <p role="status">Loading source snapshots...</p> : null}
      {communityError ? <div className="notice error" role="alert">{communityError}</div> : null}
      {community ? <p className="muted">Sampled {timestamp(community.sampledAt)} · {fresh ? 'Fresh' : 'Stale'} · Retained current state</p> : null}
      {community ? <p className="muted">Window: {timestamp(community.current?.start)} to {timestamp(community.current?.end)} (end exclusive). {community.comparable ? `Prior: ${timestamp(community.previous?.start)} to ${timestamp(community.previous?.end)}.` : 'The prior calendar period is shorter than the current elapsed window; comparison is unavailable.'}</p> : null}
      <div className="overview-grid">{Object.entries(COMMUNITY).map(([key, label]) => <Metric key={key} label={label} metric={community?.metrics?.[key]} fresh={fresh} comparable={community?.comparable} />)}</div>
    </LythCard>
    <LythCard variant="panel"><h2>Members and contributors</h2>
      <p>Contributors are active members; readers can be active without contributing. These figures use the UTC reporting window above.</p>
      <div className="overview-grid">
        <article className="overview-metric"><h3>Active members</h3><strong className="kpi-value">Unavailable</strong><p>{activity.activeMembers.reason}</p></article>
        <article className="overview-metric"><h3>Known active lower bound</h3>
          <strong className="kpi-value">{activity.knownActiveLowerBound.value === null ? 'Unavailable' : `At least ${format(activity.knownActiveLowerBound.value, 'count')}`}</strong>
          <p>{activity.knownActiveLowerBound.reason}</p>
          <p className="muted">This minimum includes counted contributors with admin roles. Other active members remain unmeasured.</p>
        </article>
        <article className="overview-metric"><h3>Contributor share of active members</h3><strong className="kpi-value">Unavailable</strong><p>{activity.contributorActiveRatio.reason}</p></article>
        <article className="overview-metric"><h3>Quiet members</h3><strong className="kpi-value">Unavailable</strong><p>{activity.quietMembers.reason}</p></article>
      </div>
    </LythCard>
    <ActivityPilotSummary />
    <LythCard variant="panel"><h2>Current account entitlements</h2><p className="muted">Free, Premium and Black are current account entitlements. Payment, upgrades, cancellations and revenue require payment records.</p>
      <div className="overview-grid">{Object.entries(SUBSCRIPTIONS).map(([key, label]) => <Metric key={key} label={label} metric={community?.metrics?.[key]} fresh={fresh} comparable={false} />)}</div>
    </LythCard>
    <LythCard variant="panel"><h2>Provider usage and cost</h2><div className="overview-grid">
      {['cloudflare', 'planetscale'].map(provider => <article className="overview-metric" key={provider}><h3>{provider === 'cloudflare' ? 'Cloudflare' : 'PlanetScale'}</h3>
        <strong className="kpi-value">Unavailable</strong><p>{community?.providers?.[provider]?.reason || 'Verified provider telemetry is unavailable.'}</p>
        <p className="muted">Accrued estimate, finalized invoice, currency and accounting period: unavailable.</p></article>)}
    </div></LythCard>
    <LythCard variant="panel"><h2>Operational snapshot</h2>
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      <p className="muted">Source requests started {timestamp(snapshot?.fetchedAt)} · {operational ? 'Fresh' : 'Stale or unavailable'}. Refresh after 60 seconds.</p>
      <p className="muted">Database clock: {timestamp(snapshot?.databaseTime)}. Queue counts cover the loaded page only.</p>
      <div className="kpi-grid">
        <div><span className="detail-label">Admin API</span><strong className="kpi-value">{operational?.health || 'Unknown'}</strong></div>
        <div><span className="detail-label">Open moderation cases in loaded page</span><strong className="kpi-value">{format(operational?.openCases)}</strong></div>
        <div><span className="detail-label">Pending adjudications in loaded page</span><strong className="kpi-value">{format(operational?.appeals)}</strong></div>
        <div><span className="detail-label">Recent audit entries in loaded page</span><strong className="kpi-value">{format(operational?.audit)}</strong></div>
        <div><span className="detail-label">Waiting list</span><strong className="kpi-value">{format(operational?.waitlist?.totalWaiting)}</strong></div>
        <div><span className="detail-label">Verified accounts</span><strong className="kpi-value">{format(operational?.accounts?.verified)}</strong></div>
        <div><span className="detail-label">Pending verification</span><strong className="kpi-value">{format(operational?.accounts?.pendingVerification)}</strong></div>
        <div><span className="detail-label">Accounts with active status</span><strong className="kpi-value">{format(operational?.accounts?.active)}</strong></div>
        <div><span className="detail-label">Email outbox status</span><strong className="kpi-value">{operational?.email?.status || 'Unknown'}</strong></div>
        <div><span className="detail-label">Email accepted, rows created last 24 hours</span><strong className="kpi-value">{format(operational?.email?.acceptedLast24Hours)}</strong></div>
        <div><span className="detail-label">Email delivered, rows created last 24 hours</span><strong className="kpi-value">{format(operational?.email?.deliveredLast24Hours)}</strong></div>
        <div><span className="detail-label">Email failures, rows created last 24 hours</span><strong className="kpi-value">{format(operational?.email?.failuresLast24Hours)}</strong></div>
      </div>
    </LythCard>
    <LythCard variant="panel"><details><summary>Tracking gaps and unavailable metrics</summary><dl className="overview-gaps">
      {Object.entries(GAP_LABELS).map(([key, label]) => <div key={key}><dt>{label}: unavailable</dt><dd>{community?.gaps?.[key] || 'A verified metric source and definition are required.'}</dd></div>)}
    </dl></details></LythCard>
    <div className="page-grid">
      <LythCard variant="panel"><h2>Moderation</h2><p>Review flags and recorded decisions.</p><Link to="/flags">Open moderation cases</Link></LythCard>
      <LythCard variant="panel"><h2>Appeals</h2><p>Review pending adjudications separately from appeal outcomes.</p><Link to="/appeals">Open pending adjudications</Link></LythCard>
      <LythCard variant="panel"><h2>Accounts</h2><p>Exact-email support, recorded history and existing account administration.</p><Link to="/accounts">Open Accounts</Link></LythCard>
      <LythCard variant="panel"><h2>Audit</h2><p>Review recorded administrative events.</p><Link to="/audit">Open audit trail</Link></LythCard>
    </div>
  </PageLayout>;
}

export default Dashboard;
