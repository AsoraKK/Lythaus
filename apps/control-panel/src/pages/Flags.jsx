import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';
import { formatDateTime } from '../utils/formatters.js';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';
import LythInput from '../components/LythInput.jsx';
import PageLayout from '../components/PageLayout.jsx';

const MODERATION_GUIDE = {
  title: 'What this page does',
  summary: 'Moderation cases aggregates neutral user flags and records one auditable allow, block, or queue decision.',
  items: [
    'Review open cases before resolved cases.',
    'A flag is evidence, not a public finding.',
    'Allow and block resolve the case; queue keeps it under review.',
    'Every decision requires a stable policy reason code.',
    'AI-generated content cannot be allowed for public publication.'
  ],
  footnote: 'Appeals remain open until the independent reviewer and adjudication policy resolves them.'
};

function Flags() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [outcome, setOutcome] = useState('queue');
  const [reasonCode, setReasonCode] = useState('MODERATION.REVIEW_REQUIRED');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminRequest('moderation/cases');
      setItems(response?.items || []);
      setSelected((current) => {
        if (!current) return null;
        return (response?.items || []).find((item) => item.id === current.id) || null;
      });
    } catch (err) {
      setError(err.message || 'Failed to load moderation cases.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const submitDecision = async () => {
    if (!selected) return;
    const normalizedReason = reasonCode.trim().toUpperCase();
    if (!/^[A-Z0-9_.:-]{2,80}$/.test(normalizedReason)) {
      setMessage('Enter a stable policy reason code.');
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      const result = await adminRequest(`moderation/cases/${selected.id}/decision`, {
        method: 'POST',
        body: { outcome, reasonCode: normalizedReason }
      });
      setMessage(`Decision recorded: ${result?.outcome || outcome}.`);
      await loadCases();
    } catch (err) {
      setMessage(err.message || 'Failed to record moderation decision.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageLayout
      title="Moderation cases"
      subtitle="Review aggregated flags and record auditable visibility decisions."
      guide={MODERATION_GUIDE}
    >
      <div className="page-grid">
        <LythCard variant="panel">
          <div className="panel-header">
            <h2>Cases</h2>
            <LythButton variant="ghost" type="button" onClick={loadCases} disabled={loading}>
              Refresh
            </LythButton>
          </div>
          {error ? <div className="notice error">{error}</div> : null}
          <div className="data-table">
            <div className="data-row header">
              <span>Case</span>
              <span>Content</span>
              <span>State</span>
              <span>Flags</span>
              <span>Policy</span>
              <span>Created</span>
              <span>Actions</span>
            </div>
            {items.map((item) => (
              <div key={item.id} className="data-row">
                <span>{item.id}</span>
                <span>
                  <strong>{item.content_type}</strong>
                  <span className="muted">{item.content_id}</span>
                </span>
                <span>{item.state}</span>
                <span>{item.flag_count}</span>
                <span>{item.policy_version}</span>
                <span>{formatDateTime(item.created_at)}</span>
                <span>
                  <LythButton variant="ghost" type="button" onClick={() => setSelected(item)}>
                    Decide
                  </LythButton>
                </span>
              </div>
            ))}
          </div>
          {!items.length && !loading ? <div className="empty-state">No moderation cases found.</div> : null}
        </LythCard>

        <LythCard variant="panel">
          <div className="panel-header"><h2>Record decision</h2></div>
          {!selected ? (
            <div className="empty-state">Select a moderation case.</div>
          ) : (
            <div className="form-grid">
              <div className="detail-list">
                <div><span className="detail-label">Case</span><span>{selected.id}</span></div>
                <div><span className="detail-label">Content</span><span>{selected.content_type} {selected.content_id}</span></div>
              </div>
              <label className="field">
                <span className="field-label">Outcome</span>
                <LythInput as="select" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
                  <option value="queue">Keep under review</option>
                  <option value="allow">Allow publication</option>
                  <option value="block">Block publication</option>
                </LythInput>
              </label>
              <label className="field">
                <span className="field-label">Reason code</span>
                <LythInput value={reasonCode} maxLength={80} onChange={(event) => setReasonCode(event.target.value)} />
              </label>
              {message ? <div className="notice">{message}</div> : null}
              <div className="panel-actions">
                <LythButton type="button" onClick={submitDecision} disabled={submitting}>
                  Record decision
                </LythButton>
              </div>
            </div>
          )}
        </LythCard>
      </div>
    </PageLayout>
  );
}

export default Flags;
