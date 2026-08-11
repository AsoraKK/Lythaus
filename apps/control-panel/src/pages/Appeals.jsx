import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';
import { formatDateTime } from '../utils/formatters.js';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';
import LythInput from '../components/LythInput.jsx';
import PageLayout from '../components/PageLayout.jsx';

const APPEALS_GUIDE = {
  title: 'What this page does',
  summary: 'Appeals lists trained reviewer-panel outcomes that require independent editorial adjudication.',
  items: [
    'Confirm the five-reviewer quorum and weighted panel result.',
    'Check whether the case is standard or high risk.',
    'Record only your own trained adjudication decision.',
    'High-risk cases require two independent adjudicators.',
    'The governance service applies an outcome only after all policy gates pass.'
  ],
  footnote: 'There is no moderator override or time-based auto-resolution path.'
};

function Appeals() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [decision, setDecision] = useState('uphold');
  const [reasonCode, setReasonCode] = useState('APPEAL.PANEL_CONFIRMED');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const loadAppeals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminRequest('appeals/pending-adjudication');
      setItems(response?.items || []);
      setSelected((current) => {
        if (!current) return null;
        return (response?.items || []).find((item) => item.appeal_id === current.appeal_id) || null;
      });
    } catch (err) {
      setError(err.message || 'Failed to load pending adjudications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppeals();
  }, [loadAppeals]);

  const submitAdjudication = async () => {
    if (!selected) return;
    const normalizedReason = reasonCode.trim().toUpperCase();
    if (!/^[A-Z0-9_.:-]{2,80}$/.test(normalizedReason)) {
      setMessage('Enter a stable reason code using A-Z, 0-9, dot, underscore, colon, or dash.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    try {
      const outcome = await adminRequest(`appeals/${selected.appeal_id}/adjudications`, {
        method: 'POST',
        body: { decision, reasonCode: normalizedReason }
      });
      setMessage(
        outcome?.status === 'resolved'
          ? `Appeal resolved: ${outcome.finalDecision}.`
          : `Adjudication recorded; governance state is ${outcome?.status || 'pending'}.`
      );
      await loadAppeals();
    } catch (err) {
      setMessage(err.message || 'Failed to record adjudication.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageLayout
      title="Appeals"
      subtitle="Independent trained-reviewer outcomes awaiting editorial adjudication."
      guide={APPEALS_GUIDE}
    >
      <div className="page-grid">
        <LythCard variant="panel">
          <div className="panel-header">
            <h2>Pending adjudication</h2>
            <LythButton variant="ghost" type="button" onClick={loadAppeals} disabled={loading}>
              Refresh
            </LythButton>
          </div>
          {error ? <div className="notice error">{error}</div> : null}
          <div className="data-table">
            <div className="data-row header">
              <span>Appeal</span>
              <span>Risk</span>
              <span>Reviewers</span>
              <span>Weight</span>
              <span>Panel result</span>
              <span>Adjudicators</span>
              <span>Created</span>
              <span>Actions</span>
            </div>
            {items.map((item) => (
              <div key={item.appeal_id} className="data-row">
                <span>
                  <strong>{item.appeal_id}</strong>
                  <span className="muted">Case {item.case_id}</span>
                </span>
                <span>{item.risk_class}</span>
                <span>{item.completed_reviewers}/5</span>
                <span>
                  {item.total_weight} ({Math.round((item.winning_share || 0) * 100)}%)
                </span>
                <span>{item.reviewer_panel_decision || '-'}</span>
                <span>{item.completed_adjudicators}/{item.required_adjudicators}</span>
                <span>{formatDateTime(item.created_at)}</span>
                <span>
                  <LythButton variant="ghost" type="button" onClick={() => setSelected(item)}>
                    Adjudicate
                  </LythButton>
                </span>
              </div>
            ))}
          </div>
          {!items.length && !loading ? (
            <div className="empty-state">No appeals require adjudication.</div>
          ) : null}
        </LythCard>

        <LythCard variant="panel">
          <div className="panel-header">
            <h2>Record decision</h2>
          </div>
          {!selected ? (
            <div className="empty-state">Select a pending appeal.</div>
          ) : (
            <div className="form-grid">
              <div className="detail-list">
                <div>
                  <span className="detail-label">Appeal</span>
                  <span>{selected.appeal_id}</span>
                </div>
                <div>
                  <span className="detail-label">Reviewer-panel result</span>
                  <span>{selected.reviewer_panel_decision}</span>
                </div>
                <div>
                  <span className="detail-label">Policy</span>
                  <span>{selected.policy_version}</span>
                </div>
              </div>
              <label className="field">
                <span className="field-label">Decision</span>
                <LythInput as="select" value={decision} onChange={(event) => setDecision(event.target.value)}>
                  <option value="uphold">Uphold</option>
                  <option value="overturn">Overturn</option>
                </LythInput>
              </label>
              <label className="field">
                <span className="field-label">Reason code</span>
                <LythInput value={reasonCode} maxLength={80} onChange={(event) => setReasonCode(event.target.value)} />
              </label>
              {message ? <div className="notice">{message}</div> : null}
              <div className="notice warning">
                Your adjudication is immutable. Standard cases need one trained adjudicator; high-risk cases need two independent trained adjudicators.
              </div>
              <div className="panel-actions">
                <LythButton type="button" onClick={submitAdjudication} disabled={submitting}>
                  Record adjudication
                </LythButton>
              </div>
            </div>
          )}
        </LythCard>
      </div>
    </PageLayout>
  );
}

export default Appeals;
