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
    'Email search matches the complete address exactly and checks no more than 1,000 contacts after the selected filters.',
    'Do not copy email addresses into tickets, chat, or operational logs.',
    'Every successful view and mutation is recorded in the administrator audit trail.',
    'Unsubscribe records a retention-aware purge request; an active hold blocks purge.',
    'Existing-account checks use the owner-only support lookup and never merge identities.'
  ],
  footnote: 'Cloudflare Access authentication and administrator membership are enforced by the admin API.'
};

function Waitlist() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ totalWaiting: null, last7Days: null, last24Hours: null });
  const [nextCursor, setNextCursor] = useState(null);
  const [filters, setFilters] = useState({ q: '', status: '', source: '', createdAfter: '', createdBefore: '' });
  const [appliedFilters, setAppliedFilters] = useState({ q: '', status: '', source: '', createdAfter: '', createdBefore: '' });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [supportAccess, setSupportAccess] = useState('checking');
  const [linkedAccounts, setLinkedAccounts] = useState({});
  const [linkLookupBusyId, setLinkLookupBusyId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [reasonCode, setReasonCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [editSource, setEditSource] = useState('');
  const [newEntry, setNewEntry] = useState({ email: '', source: 'keeper', reasonCode: '', confirmation: '' });

  const loadWaitlist = useCallback(async ({ cursor = null, append = false } = {}) => {
    setPendingAction(null);
    setReasonCode('');
    setConfirmation('');
    append ? setLoadingMore(true) : setLoading(true);
    if (!append) { setLinkedAccounts({}); setAppliedFilters({ ...filters }); }
    setError('');
    try {
      const response = await adminRequest('waitlist', { query: { ...filters, limit: 50, cursor } });
      if (!response || !Array.isArray(response.items) || !response.summary) throw new Error('invalid_waitlist_response');
      setItems((current) => append ? [...current, ...response.items] : response.items);
      setSummary({ totalWaiting: Number(response.summary.totalWaiting ?? 0), last7Days: Number(response.summary.last7Days ?? 0), last24Hours: Number(response.summary.last24Hours ?? 0) });
      setNextCursor(response.nextCursor || null);
    } catch (requestError) {
      if (requestError.status === 401 || requestError.status === 403) {
        setItems([]); setNextCursor(null); setSummary({ totalWaiting: null, last7Days: null, last24Hours: null });
        setError(requestError.status === 403 ? 'Administrator access is required to view waitlist contacts.' : 'Sign in through approved admin access to view waitlist contacts.');
      } else if (requestError.payload?.error === 'waitlist_search_limit_exceeded') {
        setItems([]); setNextCursor(null);
        setError('This exact-email search reached the 1,000-contact scan limit. Narrow the status, source, or date filters and try again.');
      } else {
        if (!append) { setItems([]); setNextCursor(null); }
        setError('Waitlist data could not be loaded.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters]);

  useEffect(() => { loadWaitlist(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true;
    adminRequest('account-support/access').then((response) => {
      if (active) setSupportAccess(response?.available === true ? 'ready' : 'unavailable');
    }).catch((requestError) => {
      if (active) setSupportAccess(requestError.status === 403 ? 'denied' : 'unavailable');
    });
    return () => { active = false; };
  }, []);

  const checkAccountLink = async (item) => {
    if (supportAccess !== 'ready') return;
    setLinkLookupBusyId(item.id);
    setLinkedAccounts((current) => ({ ...current, [item.id]: { state: 'checking' } }));
    try {
      const response = await adminRequest('account-support/lookup', {
        method: 'POST', body: { email: item.email, reasonCode: 'SUPPORT_REQUEST' },
      });
      setLinkedAccounts((current) => ({ ...current, [item.id]: {
        state: response?.state,
        status: response?.state === 'found' ? response.account?.status : null,
      } }));
    } catch (requestError) {
      if (requestError.status === 401 || requestError.status === 403) setSupportAccess('denied');
      setLinkedAccounts((current) => ({ ...current, [item.id]: { state: 'unavailable' } }));
    } finally {
      setLinkLookupBusyId(null);
    }
  };

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
    let resultMessage = 'Action recorded.';
    try {
      if (operation === 'status') {
        const response = await adminRequest(`waitlist/${encodeURIComponent(item.id)}/status`, { method: 'POST', body: { status: item.nextStatus, reasonCode: normalizedReason, confirmation } });
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: response.status } : entry));
        if (item.nextStatus === 'unsubscribed') resultMessage = item.retentionHold
          ? 'Unsubscribed. Purge is blocked by the active retention hold.'
          : 'Unsubscribed. A retention-aware purge request was recorded.';
      } else if (operation === 'hold') {
        const response = await adminRequest(`waitlist/${encodeURIComponent(item.id)}/retention-hold`, { method: 'POST', body: { active: item.nextActive, reasonCode: normalizedReason, confirmation } });
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, retentionHold: response.retentionHold } : entry));
      } else if (operation === 'edit') {
        const response = await adminRequest(`waitlist/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: { source: editSource, reasonCode: normalizedReason, confirmation } });
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, source: response.source } : entry));
      } else {
        const response = await adminRequest(`waitlist/${encodeURIComponent(item.id)}`, { method: 'DELETE', body: { reasonCode: normalizedReason, confirmation }, headers: { 'Idempotency-Key': idempotencyKey() } });
        setItems((current) => current.filter((entry) => entry.id !== item.id));
        setLinkedAccounts((current) => { const next = { ...current }; delete next[item.id]; return next; });
        resultMessage = response?.purgeBlockedByRetentionHold
          ? 'Unsubscribed. Purge is blocked by the active retention hold.'
          : 'Unsubscribed. A retention-aware purge request was recorded.';
      }
      setPendingAction(null);
      setActionMessage(resultMessage);
      setUpdatingId(null);
    } catch (requestError) {
      if (requestError.status === 401 || requestError.status === 403) {
        setPendingAction(null);
        setReasonCode('');
        setConfirmation('');
        setItems([]);
        setNextCursor(null);
        setSummary({ totalWaiting: null, last7Days: null, last24Hours: null });
        setError(requestError.status === 403 ? 'Administrator access is required to view waitlist contacts.' : 'Sign in through approved admin access to view waitlist contacts.');
        setUpdatingId(null);
        return;
      }
      setActionMessage('The waitlist action could not be completed.');
      setUpdatingId(null);
    }
  };

  const updateFilter = (patch) => {
    setPendingAction(null);
    setReasonCode('');
    setConfirmation('');
    setFilters((current) => ({ ...current, ...patch }));
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
        <p className="muted">Email search is exact. Account-link checks are owner-only, read-only, and never merge identities.</p>
        <form className="form-row" onSubmit={(event) => { event.preventDefault(); loadWaitlist(); }}>
          <LythInput type="email" aria-label="Search waitlist by exact email" value={filters.q} onChange={(event) => updateFilter({ q: event.target.value })} placeholder="Exact email address" />
          <select aria-label="Filter waitlist status" value={filters.status} onChange={(event) => updateFilter({ status: event.target.value })}><option value="">All statuses</option><option value="waiting">Waiting</option><option value="invited">Invited</option><option value="converted">Converted</option><option value="unsubscribed">Unsubscribed</option></select>
          <LythInput value={filters.source} onChange={(event) => updateFilter({ source: event.target.value })} placeholder="Source" />
          <LythInput type="datetime-local" aria-label="Waitlist created after" value={filters.createdAfter} onChange={(event) => updateFilter({ createdAfter: event.target.value })} />
          <LythInput type="datetime-local" aria-label="Waitlist created before" value={filters.createdBefore} onChange={(event) => updateFilter({ createdBefore: event.target.value })} />
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
        {!loading && !error && items.length === 0 ? <div className="waitlist-empty"><h2>{hasWaitlistFilters(appliedFilters) ? 'No contacts match these filters' : 'No waitlist signups yet'}</h2><p>{hasWaitlistFilters(appliedFilters) ? 'Try a different exact address or widen the selected filters.' : 'New waitlist requests will appear here.'}</p></div> : null}
        {!loading && !error && items.length > 0 ? <div className="waitlist-table-wrap"><table className="waitlist-table"><thead><tr><th>Email</th><th>Status</th><th>Source</th><th>Joined</th><th>Existing account</th><th>Actions</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}>
          <td>{item.email}</td><td><span className={`waitlist-status ${String(item.status).toLowerCase()}`}>{item.status}</span><span className="muted">{item.retentionHold ? 'Retention hold active' : ''}</span></td><td>{item.source}</td><td>{formatDateTime(item.createdAt)}</td><td><AccountLinkStatus item={item} value={linkedAccounts[item.id]} access={supportAccess} busy={linkLookupBusyId === item.id} onCheck={checkAccountLink} /></td>
          <td><div className="waitlist-actions">
            <select aria-label={`Update waitlist status for ${item.email}`} value={item.status} onChange={(event) => beginAction({ ...item, nextStatus: event.target.value }, 'status', `UPDATE WAITLIST STATUS ${item.id} TO ${event.target.value.toUpperCase()}`)} disabled={loading || loadingMore || updatingId === item.id || ['converted', 'unsubscribed'].includes(item.status)}><option value={item.status}>{item.status}</option>{item.status === 'waiting' ? <option value="invited">Invited</option> : null}{['waiting', 'invited'].includes(item.status) ? <option value="converted">Converted</option> : null}</select>
            <LythButton variant="ghost" type="button" onClick={() => beginAction({ ...item, nextActive: !item.retentionHold }, 'hold', `${item.retentionHold ? 'RELEASE' : 'PLACE'} RETENTION HOLD ${item.id}`)} disabled={loading || loadingMore || updatingId === item.id}>{item.retentionHold ? 'Release hold' : 'Place hold'}</LythButton>
            <LythButton variant="ghost" type="button" onClick={() => beginAction(item, 'edit', `UPDATE WAITLIST ${item.id}`)} disabled={loading || loadingMore || updatingId === item.id}>Edit source</LythButton>
            <LythButton variant="danger" type="button" onClick={() => beginAction(item, 'delete', `UNSUBSCRIBE AND REQUEST PURGE ${item.id}`)} disabled={loading || loadingMore || updatingId === item.id}>Unsubscribe + request purge</LythButton>
          </div></td>
        </tr>)}</tbody></table></div> : null}
        {nextCursor && !loading ? <div className="waitlist-pagination"><LythButton variant="secondary" type="button" onClick={() => loadWaitlist({ cursor: nextCursor, append: true })} disabled={loadingMore}>{loadingMore ? 'Loading...' : 'Load more'}</LythButton></div> : null}
      </LythCard>

      {pendingAction ? <LythCard variant="panel"><div className="panel-header"><h2>Confirm waitlist action</h2></div><div className="waitlist-confirmation-summary" role="note"><p><strong>Record:</strong> {pendingAction.item.email}</p><p>{waitlistActionSummary(pendingAction, editSource)}</p></div><p>Type <strong>{pendingAction.expected}</strong> to confirm this action.</p><div className="form-row">{pendingAction.operation === 'edit' ? <LythInput aria-label="Waitlist source" value={editSource} onChange={(event) => setEditSource(event.target.value)} placeholder="Source" /> : null}<LythInput aria-label="Waitlist reason code" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} placeholder="Reason code" /><LythInput aria-label="Waitlist confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={pendingAction.expected} /><LythButton variant="danger" type="button" onClick={confirmAction} disabled={updatingId === pendingAction.item.id}>Confirm</LythButton><LythButton variant="ghost" type="button" onClick={() => { setPendingAction(null); setReasonCode(''); setConfirmation(''); }}>Cancel</LythButton></div></LythCard> : null}
    </PageLayout>
  );
}

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `keeper-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hasWaitlistFilters(filters) {
  return Object.values(filters).some(Boolean);
}

function waitlistActionSummary(action, editSource) {
  const { item, operation } = action;
  if (operation === 'status' && item.nextStatus === 'unsubscribed') {
    return `Unsubscribe and record a retention-aware purge request for this contact. Current status: ${item.status}; requested status: unsubscribed. An active retention hold blocks purge; this action does not immediately delete the contact.`;
  }
  if (operation === 'status') return `Change status from ${item.status} to ${item.nextStatus}.`;
  if (operation === 'hold') return `${item.nextActive ? 'Place' : 'Release'} the retention hold for this contact.`;
  if (operation === 'edit') return `Change source from ${item.source || 'none'} to ${editSource || 'none'}.`;
  return `Unsubscribe this contact and record a retention-aware purge request. Current status: ${item.status}; resulting status: unsubscribed. An active retention hold blocks purge; this action does not immediately delete the contact.`;
}

function AccountLinkStatus({ item, value, access, busy, onCheck }) {
  if (value?.state === 'checking' || busy) return <span role="status">Checking...</span>;
  if (value?.state === 'found') return <span>Existing account · {value.status || 'status unavailable'}</span>;
  if (value?.state === 'not_found') return <span>No exact account match</span>;
  if (value?.state === 'ambiguous') return <span>Conflicting account records · no link returned</span>;
  if (value?.state === 'unavailable') return <span>Account link could not be checked</span>;
  if (access === 'ready') return <LythButton variant="ghost" type="button" onClick={() => onCheck(item)} aria-label={`Check existing account for ${item.email}`}>Check account link</LythButton>;
  if (access === 'checking') return <span>Checking owner access...</span>;
  if (access === 'denied') return <span>Owner-only lookup</span>;
  return <span>Account lookup unavailable</span>;
}

function metric(value) {
  if (value === null || value === undefined || value === '') return 'Unknown';
  return Number.isFinite(Number(value)) ? Number(value) : 'Unknown';
}

export default Waitlist;
