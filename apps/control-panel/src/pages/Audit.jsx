import { useEffect, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';
import { formatDateTime } from '../utils/formatters.js';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';
import PageLayout from '../components/PageLayout.jsx';

function formatActionLabel(entry) {
  const action = entry.action || 'UNKNOWN';
  const reasonCode = entry.reason_code || entry.reasonCode;
  const reason = reasonCode ? ` (${reasonCode})` : '';
  return `${action}${reason}`;
}

const AUDIT_GUIDE = {
  title: 'What this page does',
  summary:
    'Audit is the immutable event stream for administrative actions across moderation, users, and access.',
  items: [
    'Use refresh before incident reviews to avoid stale evidence.',
    'Check actor id, action, and target type together.',
    'Correlate high-impact actions with reason codes and notes.',
    'Escalate any action without expected rationale metadata.',
    'Use this view as the source of truth during post-incident analysis.'
  ],
  footnote:
    'Audit entries should never be edited manually; investigate source services if formatting looks wrong.'
};

function Audit() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadAudit = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminRequest('audit');
      setItems(response?.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load audit entries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, []);

  return (
    <PageLayout
      title="Audit"
      subtitle="Immutable administrative activity log with target and actor traceability."
      guide={AUDIT_GUIDE}
    >
      <LythCard variant="panel">
        <div className="panel-header">
          <h2>Recent activity</h2>
          <div className="panel-actions">
            <LythButton
              variant="ghost"
              type="button"
              onClick={loadAudit}
              disabled={loading}
            >
              Refresh
            </LythButton>
          </div>
        </div>
        {error ? <div className="notice error">{error}</div> : null}
        <div className="audit-table">
          <div className="audit-row header">
            <span>Timestamp</span>
            <span>Actor</span>
            <span>Action</span>
            <span>Target</span>
          </div>
          {items.map((entry) => (
            <div key={entry.id || entry.correlation_id} className="audit-row">
              <span>{formatDateTime(entry.created_at || entry.timestamp)}</span>
              <span>{entry.actor_id || entry.actorId || '-'}</span>
              <span>
                <strong>{formatActionLabel(entry)}</strong>
                {entry.note ? <span className="muted">{entry.note}</span> : null}
              </span>
              <span>
                <strong>{entry.target_id || entry.subjectId || '-'}</strong>
                {entry.target_type || entry.targetType ? (
                  <span className="muted">{entry.target_type || entry.targetType}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        {!items.length && !loading ? (
          <div className="empty-state">No audit entries found.</div>
        ) : null}
      </LythCard>
    </PageLayout>
  );
}

export default Audit;
