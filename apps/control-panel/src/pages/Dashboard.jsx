import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminRequest } from '../api/adminApi.js';
import PageLayout from '../components/PageLayout.jsx';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';

const DASHBOARD_GUIDE = {
  title: 'How to use this dashboard',
  summary: 'This console reports only live admin Worker capabilities and private operational queues.',
  items: [
    'Confirm the admin API and database health first.',
    'Prioritise open moderation cases and pending appeal adjudications.',
    'Use the audit trail to verify every high-impact action.',
    'Cloudflare Access manages this browser session.',
    'Treat unavailable metrics as unknown, never zero.'
  ],
  footnote: 'Production launch readiness is tracked separately from this repository console.'
};

function Dashboard() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [health, summary, emailHealth, moderation, appeals, audit] = await Promise.all([
        adminRequest('health'),
        adminRequest('auth/summary'),
        adminRequest('email-health'),
        adminRequest('moderation/cases'),
        adminRequest('appeals/pending-adjudication'),
        adminRequest('audit'),
      ]);
      const moderationItems = moderation?.items || [];
      setSnapshot({
        health: health?.status || 'unknown',
        databaseTime: health?.database?.database_time || null,
        accounts: summary?.accounts || {},
        waitlist: summary?.waitlist || {},
        emailHealth: emailHealth || {},
        openCases: moderationItems.filter((item) => item.state === 'open').length,
        pendingAdjudications: (appeals?.items || []).length,
        auditEntries: (audit?.items || []).length,
      });
    } catch (err) {
      setSnapshot(null);
      setError(err.message || 'Operational snapshot is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  return (
    <PageLayout title="Operations" subtitle="Live admin Worker health and governance queues." guide={DASHBOARD_GUIDE}>
      <LythCard variant="panel">
        <div className="panel-header">
          <h2>Operational snapshot</h2>
          <LythButton variant="ghost" type="button" onClick={loadSnapshot} disabled={loading}>Refresh</LythButton>
        </div>
        {error ? <div className="notice error">{error}</div> : null}
        {snapshot ? (
          <div className="kpi-grid">
            <div><span className="detail-label">Admin API</span><strong className="kpi-value">{snapshot.health}</strong></div>
            <div><span className="detail-label">Open moderation cases</span><strong className="kpi-value">{snapshot.openCases}</strong></div>
            <div><span className="detail-label">Pending adjudications</span><strong className="kpi-value">{snapshot.pendingAdjudications}</strong></div>
            <div><span className="detail-label">Recent audit entries</span><strong className="kpi-value">{snapshot.auditEntries}</strong></div>
            <div><span className="detail-label">Waiting list</span><strong className="kpi-value">{metric(snapshot.waitlist.totalWaiting)}</strong></div>
            <div><span className="detail-label">Waiting, last 24 hours</span><strong className="kpi-value">{metric(snapshot.waitlist.last24Hours)}</strong></div>
            <div><span className="detail-label">Verified accounts</span><strong className="kpi-value">{metric(snapshot.accounts.verified)}</strong></div>
            <div><span className="detail-label">Pending verification</span><strong className="kpi-value">{metric(snapshot.accounts.pendingVerification)}</strong></div>
            <div><span className="detail-label">Active accounts</span><strong className="kpi-value">{metric(snapshot.accounts.active)}</strong></div>
            <div><span className="detail-label">Suspended / locked</span><strong className="kpi-value">{metricPair(snapshot.accounts.suspended, snapshot.accounts.locked)}</strong></div>
            <div><span className="detail-label">Email health</span><strong className="kpi-value">{snapshot.emailHealth.status || 'unknown'}</strong></div>
            <div><span className="detail-label">Email accepted, last 24 hours</span><strong className="kpi-value">{metric(snapshot.emailHealth.acceptedLast24Hours)}</strong></div>
            <div><span className="detail-label">Email delivered, last 24 hours</span><strong className="kpi-value">{metric(snapshot.emailHealth.deliveredLast24Hours)}</strong></div>
            <div><span className="detail-label">Email failures, last 24 hours</span><strong className="kpi-value">{metric(snapshot.emailHealth.failuresLast24Hours)}</strong></div>
          </div>
        ) : null}
      </LythCard>
      <div className="page-grid">
        <LythCard variant="panel"><h2>Moderation</h2><p>Review neutral flags and record allow, block, or queue decisions.</p><Link to="/flags">Open moderation cases</Link></LythCard>
        <LythCard variant="panel"><h2>Appeals</h2><p>Record trained editorial adjudications after the five-reviewer panel completes.</p><Link to="/appeals">Open pending adjudications</Link></LythCard>
        <LythCard variant="panel"><h2>Users</h2><p>Search accounts and apply reason-coded status changes.</p><Link to="/users">Open account safety</Link></LythCard>
        <LythCard variant="panel"><h2>Audit</h2><p>Review immutable administrative events.</p><Link to="/audit">Open audit trail</Link></LythCard>
      </div>
    </PageLayout>
  );
}

function metric(value) {
  if (value === null || value === undefined || value === '') return 'Unknown';
  return Number.isFinite(Number(value)) ? Number(value) : 'Unknown';
}

function metricPair(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return 'Unknown';
  if (!Number.isFinite(Number(left)) || !Number.isFinite(Number(right))) return 'Unknown';
  return `${Number(left)} / ${Number(right)}`;
}

export default Dashboard;
