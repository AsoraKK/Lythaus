import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';
import { formatDateTime } from '../utils/formatters.js';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';
import LythInput from '../components/LythInput.jsx';
import PageLayout from '../components/PageLayout.jsx';

const WAITLIST_GUIDE = {
  title: 'Handling waitlist data',
  summary: 'This view contains identifiable email addresses submitted for Lythaus early access.',
  items: [
    'Use search, status, and source filters before loading more records.',
    'Do not copy email addresses into tickets, chat, or operational logs.',
    'Every successful view and mutation is recorded in the administrator audit trail.',
    'Deletion is a controlled unsubscribe and retention-aware purge request.'
  ],
  footnote: 'Cloudflare Access authentication and administrator membership are enforced by the admin API.'
};

function Waitlist() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ totalWaiting: null, last7Days: null, last24Hours: null });
  const [nextCursor, setNextCursor] = useState(null);
  const [filters, setFilters] = useState({ q: '', status: '', source: '', createdAfter: '', createdBefore: '' });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [reasonCode, setReasonCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [editSource, setEditSource] = useState('');
  const [newEntry, setNewEntry] = useState({ email: '', source: 'keeper', reasonCode: '', confirmation: '' });

  const loadWaitlist = useCallback(async ({ cursor = null, append = false } = {}) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError('');
    try {
      const response = await adminRequest('waitlist', { query: { ...filters, limit: 50, cursor } });
      if (!response || !Array.isArray(response.items) || !response.summary) throw new Error('invalid_waitlist_response');
      setItems((current) => append ? [...current, ...response.items] : response.items);
      setSummary({ totalWaiting: Number(response.summary.totalWaiting ?? 0), last7Days: Number(response.summary.last7Days ?? 0), last24Hours: Number(response.summary.last24Hours ?? 0) });
      setNextCursor(response.nextCursor || null);
    } catch {
      if (!append) { setItems([]); setNextCursor(null); }
      setError('Waitlist data could not be loaded.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters]);

  useEffect(() => { loadWaitlist(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const beginAction = (item, operation, expected) => {
    setPendingAction({ item, operation, expected });
    setReasonCode('');
    setConfirmation('');
    setEditSource(item.source || '');
    setActionMessage('');
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    const { item, operation, expected } = pendingAction;
    const normalizedReason = reasonCode.trim().toUpperCase();
    if (!/^[A-Z0-9_.:-]{2,80}$/.test(normalizedReason) || confirmation.trim() !== expected) {
      setActionMessage(`Enter a stable reason code and type ${expected} to confirm.`);
      return;
    }
    setUpdatingId(item.id);
    setActionMessage('');
    try {
      if (operation === 'status') {
        const response = await adminRequest(`waitlist/${encodeURIComponent(item.id)}/status`, { method: 'POST', body: { status: item.nextStatus, reasonCode: normalizedReason, confirmation } });
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: response.status } : entry));
      } else if (operation === 'hold') {
        const response = await adminRequest(`waitlist/${encodeURIComponent(item.id)}/retention-hold`, { method: 'POST', body: { active: item.nextActive, reasonCode: normalizedReason, confirmation } });
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, retentionHold: response.retentionHold } : entry));
      } else if (operation === 'edit') {
        const response = await adminRequest(`waitlist/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: { source: editSource, reasonCode: normalizedReason, confirmation } });
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, source: response.source } : entry));
      } else {
        await adminRequest(`waitlist/${encodeURIComponent(item.id)}`, { method: 'DELETE', body: { reasonCode: normalizedReason, confirmation }, headers: { 'Idempotency-Key': idempotencyKey() } });
        setItems((current) => current.filter((entry) => entry.id !== item.id));
      }
      setPendingAction(null);
      setActionMessage('Action recorded.');
      setUpdatingId(null);
    } catch {
      setActionMessage('The waitlist action could not be completed.');
      setUpdatingId(null);
    }
  };

  const submitNewEntry = async (event) => {
    event.preventDefault();
    const normalizedReason = newEntry.reasonCode.trim().toUpperCase();
    if (!/^[A-Z0-9_.:-]{2,80}$/.test(normalizedReason) || newEntry.confirmation.trim() !== 'ADD WAITLIST') {
      setActionMessage('Enter a stable reason code and type ADD WAITLIST to confirm.');
      return;
    }
    try {
      await adminRequest('waitlist', { method: 'POST', body: { email: newEntry.email, source: newEntry.source, reasonCode: normalizedReason, confirmation: newEntry.confirmation } });
      setNewEntry({ email: '', source: 'keeper', reasonCode: '', confirmation: '' });
      setActionMessage('Waitlist entry added.');
      await loadWaitlist();
    } catch {
      setActionMessage('The waitlist entry could not be added.');
    }
  };

  return (
    <PageLayout title="Waitlist" subtitle="People who have requested early access to Lythaus." guide={WAITLIST_GUIDE} className="waitlist-page" headerActions={<LythButton variant="ghost" type="button" onClick={() => loadWaitlist()} disabled={loading}>Refresh</LythButton>}>
      <div className="waitlist-summary-grid" aria-label="Waitlist summary">
        <LythCard variant="panel" className="waitlist-summary-card"><span>Waiting</span><strong>{metric(summary.totalWaiting)}</strong></LythCard>
        <LythCard variant="panel" className="waitlist-summary-card"><span>Joined in the last 7 days</span><strong>{metric(summary.last7Days)}</strong></LythCard>
        <LythCard variant="panel" className="waitlist-summary-card"><span>Joined in the last 24 hours</span><strong>{metric(summary.last24Hours)}</strong></LythCard>
      </div>

      <LythCard variant="panel">
        <form className="form-row" onSubmit={(event) => { event.preventDefault(); loadWaitlist(); }}>
          <LythInput value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Search email" />
          <select aria-label="Filter waitlist status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option><option value="waiting">Waiting</option><option value="invited">Invited</option><option value="converted">Converted</option><option value="unsubscribed">Unsubscribed</option></select>
          <LythInput value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })} placeholder="Source" />
          <LythInput type="datetime-local" aria-label="Waitlist created after" value={filters.createdAfter} onChange={(event) => setFilters({ ...filters, createdAfter: event.target.value })} />
          <LythInput type="datetime-local" aria-label="Waitlist created before" value={filters.createdBefore} onChange={(event) => setFilters({ ...filters, createdBefore: event.target.value })} />
          <LythButton type="submit" disabled={loading}>Filter</LythButton>
        </form>
      </LythCard>

      <LythCard variant="panel">
        <div className="panel-header"><h2>Add waitlist entry</h2></div>
        <form className="form-row" onSubmit={submitNewEntry}>
          <LythInput type="email" required value={newEntry.email} onChange={(event) => setNewEntry({ ...newEntry, email: event.target.value })} placeholder="Email" />
          <LythInput value={newEntry.source} onChange={(event) => setNewEntry({ ...newEntry, source: event.target.value })} placeholder="Source" />
          <LythInput required value={newEntry.reasonCode} onChange={(event) => setNewEntry({ ...newEntry, reasonCode: event.target.value })} placeholder="Reason code" />
          <LythInput required value={newEntry.confirmation} onChange={(event) => setNewEntry({ ...newEntry, confirmation: event.target.value })} placeholder="Type ADD WAITLIST" />
          <LythButton type="submit">Add</LythButton>
        </form>
      </LythCard>

      <LythCard variant="panel" className="waitlist-table-panel">
        {loading ? <p className="waitlist-loading" aria-live="polite">Loading waitlist...</p> : null}
        {error ? <div className="notice error" role="alert"><strong>{error}</strong><span>Try again. If the problem continues, check the admin API status.</span></div> : null}
        {actionMessage ? <p className="waitlist-action-error" role="status">{actionMessage}</p> : null}
        {!loading && !error && items.length === 0 ? <div className="waitlist-empty"><h2>No waitlist signups yet</h2><p>New waitlist requests will appear here.</p></div> : null}
        {!loading && items.length > 0 ? <div className="waitlist-table-wrap"><table className="waitlist-table"><thead><tr><th>Email</th><th>Status</th><th>Source</th><th>Joined</th><th>Linked account</th><th>Actions</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}>
          <td>{item.email}</td><td><span className={`waitlist-status ${String(item.status).toLowerCase()}`}>{item.status}</span><span className="muted">{item.invitedAt ? `Invited ${formatDateTime(item.invitedAt)}` : item.convertedAt ? `Converted ${formatDateTime(item.convertedAt)}` : item.unsubscribedAt ? `Unsubscribed ${formatDateTime(item.unsubscribedAt)}` : ''}</span></td><td>{item.source}</td><td>{formatDateTime(item.createdAt)}</td><td>{item.linkedAccount?.status || 'None'}</td>
          <td><div className="waitlist-actions">
            <select aria-label={`Update waitlist status for ${item.email}`} value={item.status} onChange={(event) => beginAction({ ...item, nextStatus: event.target.value }, 'status', 'UPDATE WAITLIST STATUS')} disabled={updatingId === item.id || ['converted', 'unsubscribed'].includes(item.status)}><option value={item.status}>{item.status}</option><option value="invited">Invited</option><option value="converted">Converted</option><option value="unsubscribed">Unsubscribed</option></select>
            <LythButton variant="ghost" type="button" onClick={() => beginAction({ ...item, nextActive: !item.retentionHold }, 'hold', item.retentionHold ? 'RELEASE RETENTION HOLD' : 'PLACE RETENTION HOLD')} disabled={updatingId === item.id}>{item.retentionHold ? 'Release hold' : 'Place hold'}</LythButton>
            <LythButton variant="ghost" type="button" onClick={() => beginAction(item, 'edit', 'UPDATE WAITLIST')}>Edit source</LythButton>
            <LythButton variant="danger" type="button" onClick={() => beginAction(item, 'delete', `DELETE WAITLIST ${item.id}`)}>Delete</LythButton>
          </div></td>
        </tr>)}</tbody></table></div> : null}
        {nextCursor && !loading ? <div className="waitlist-pagination"><LythButton variant="secondary" type="button" onClick={() => loadWaitlist({ cursor: nextCursor, append: true })} disabled={loadingMore}>{loadingMore ? 'Loading...' : 'Load more'}</LythButton></div> : null}
      </LythCard>

      {pendingAction ? <LythCard variant="panel"><div className="panel-header"><h2>Confirm waitlist action</h2></div><p>Type <strong>{pendingAction.expected}</strong> to continue.</p><div className="form-row">{pendingAction.operation === 'edit' ? <LythInput aria-label="Waitlist source" value={editSource} onChange={(event) => setEditSource(event.target.value)} placeholder="Source" /> : null}<LythInput aria-label="Waitlist reason code" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} placeholder="Reason code" /><LythInput aria-label="Waitlist confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={pendingAction.expected} /><LythButton variant="danger" type="button" onClick={confirmAction} disabled={updatingId === pendingAction.item.id}>Confirm</LythButton><LythButton variant="ghost" type="button" onClick={() => setPendingAction(null)}>Cancel</LythButton></div></LythCard> : null}
    </PageLayout>
  );
}

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `keeper-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function metric(value) {
  if (value === null || value === undefined || value === '') return 'Unknown';
  return Number.isFinite(Number(value)) ? Number(value) : 'Unknown';
}

export default Waitlist;
