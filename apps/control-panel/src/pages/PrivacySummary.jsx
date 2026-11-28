import { useState } from 'react';
import { adminRequest } from '../api/adminApi.js';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';
import { formatDateTime } from '../utils/formatters.js';

export default function PrivacySummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setSummary(null);
    setError('');
    setLoading(true);
    try {
      const { sampledAt, privacyRequests, activeLegalHolds } = await adminRequest('privacy/summary');
      if (!Number.isFinite(Date.parse(sampledAt)) || ![privacyRequests, activeLegalHolds].every(
        value => Number.isSafeInteger(value) && value >= 0)) throw new Error();
      setSummary({ sampledAt, privacyRequests, activeLegalHolds });
    } catch (failure) {
      setError(failure?.status === 403 ? 'Privacy access was denied.' : 'Privacy counts are unavailable.');
    } finally {
      setLoading(false);
    }
  }

  return <LythCard variant="panel">
    <div className="panel-header"><h2>Privacy requests and legal holds</h2>
      <LythButton type="button" variant="ghost" onClick={refresh} disabled={loading}>
        {loading ? 'Loading counts…' : 'Check counts'}
      </LythButton>
    </div>
    {error && <p role="alert">{error}</p>}
    {summary && <div aria-live="polite">
      <p>Sampled {formatDateTime(summary.sampledAt)}</p>
      <dl><dt>Total privacy requests</dt><dd>{summary.privacyRequests}</dd>
        <dt>Active legal holds</dt><dd>{summary.activeLegalHolds}</dd></dl>
    </div>}
  </LythCard>;
}
