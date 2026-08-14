import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';
import { formatDateTime } from '../utils/formatters.js';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';
import PageLayout from '../components/PageLayout.jsx';

const WAITLIST_GUIDE = {
  title: 'Handling waitlist data',
  summary: 'This view contains identifiable email addresses submitted for Lythaus early access.',
  items: [
    'Use the list only for approved waitlist and launch operations.',
    'Do not copy email addresses into tickets, chat, or operational logs.',
    'Refresh before using counts in an internal update.',
    'Every successful view is recorded in the administrator audit trail.'
  ],
  footnote: 'Cloudflare Access authentication and administrator membership are enforced by the admin API.'
};

function Waitlist() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ totalWaiting: 0, last7Days: 0 });
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const loadWaitlist = useCallback(async ({ cursor = null, append = false } = {}) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError('');
    try {
      const response = await adminRequest('waitlist', {
        query: { limit: 50, cursor }
      });
      if (!response || !Array.isArray(response.items) || !response.summary) throw new Error('invalid_waitlist_response');
      const received = response.items;
      setItems((current) => append ? [...current, ...received] : received);
      setSummary({
        totalWaiting: Number(response?.summary?.totalWaiting ?? 0),
        last7Days: Number(response?.summary?.last7Days ?? 0)
      });
      setNextCursor(response?.nextCursor || null);
    } catch {
      if (!append) {
        setItems([]);
        setSummary({ totalWaiting: 0, last7Days: 0 });
        setNextCursor(null);
      }
      setError('Waitlist data could not be loaded.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const updateStatus = async (item, status) => {
    if (status === item.status) return;
    setUpdatingId(item.id);
    setActionError('');
    try {
      const response = await adminRequest(`waitlist/${encodeURIComponent(item.id)}/status`, {
        method: 'POST', body: { status }
      });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: response.status } : entry));
    } catch {
      setActionError('The waitlist status could not be updated.');
    } finally {
      setUpdatingId(null);
    }
  };

  const updateRetentionHold = async (item) => {
    setUpdatingId(item.id);
    setActionError('');
    try {
      const response = await adminRequest(`waitlist/${encodeURIComponent(item.id)}/retention-hold`, {
        method: 'POST', body: { active: !item.retentionHold }
      });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, retentionHold: response.retentionHold } : entry));
    } catch {
      setActionError('The retention hold could not be updated.');
    } finally {
      setUpdatingId(null);
    }
  };

  useEffect(() => {
    loadWaitlist();
  }, [loadWaitlist]);

  return (
    <PageLayout
      title="Waitlist"
      subtitle="People who have requested early access to Lythaus."
      guide={WAITLIST_GUIDE}
      className="waitlist-page"
      headerActions={(
        <LythButton variant="ghost" type="button" onClick={() => loadWaitlist()} disabled={loading}>
          Refresh
        </LythButton>
      )}
    >
      <div className="waitlist-summary-grid" aria-label="Waitlist summary">
        <LythCard variant="panel" className="waitlist-summary-card">
          <span>Waiting</span>
          <strong>{summary.totalWaiting}</strong>
        </LythCard>
        <LythCard variant="panel" className="waitlist-summary-card">
          <span>Joined in the last 7 days</span>
          <strong>{summary.last7Days}</strong>
        </LythCard>
      </div>

      <LythCard variant="panel" className="waitlist-table-panel">
        {loading ? <p className="waitlist-loading" aria-live="polite">Loading waitlist...</p> : null}
        {error ? (
          <div className="notice error" role="alert">
            <strong>{error}</strong>
            <span>Try again. If the problem continues, check the admin API status.</span>
          </div>
        ) : null}
        {actionError ? <p className="waitlist-action-error" role="alert">{actionError}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <div className="waitlist-empty">
            <h2>No waitlist signups yet</h2>
            <p>New waitlist requests will appear here.</p>
          </div>
        ) : null}
        {!loading && items.length > 0 ? (
          <div className="waitlist-table-wrap">
            <table className="waitlist-table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th scope="col">Source</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.email}</td>
                    <td><span className={`waitlist-status ${String(item.status).toLowerCase()}`}>{item.status}</span></td>
                    <td>{item.source}</td>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>
                      <div className="waitlist-actions">
                        <label className="sr-only" htmlFor={`waitlist-status-${item.id}`}>Update waitlist status for {item.email}</label>
                        <select
                          id={`waitlist-status-${item.id}`}
                          value={item.status}
                          onChange={(event) => updateStatus(item, event.target.value)}
                          disabled={updatingId === item.id || ['converted', 'unsubscribed'].includes(item.status)}
                        >
                          <option value="waiting" disabled={item.status !== 'waiting'}>Waiting</option>
                          <option value="invited">Invited</option>
                          <option value="converted">Converted</option>
                          <option value="unsubscribed">Unsubscribed</option>
                        </select>
                        <LythButton
                          variant="ghost"
                          type="button"
                          onClick={() => updateRetentionHold(item)}
                          disabled={updatingId === item.id}
                        >
                          {item.retentionHold ? 'Release hold' : 'Place hold'}
                        </LythButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {nextCursor && !loading ? (
          <div className="waitlist-pagination">
            <LythButton variant="secondary" type="button" onClick={() => loadWaitlist({ cursor: nextCursor, append: true })} disabled={loadingMore}>
              {loadingMore ? 'Loading...' : 'Load more'}
            </LythButton>
          </div>
        ) : null}
      </LythCard>
    </PageLayout>
  );
}

export default Waitlist;
