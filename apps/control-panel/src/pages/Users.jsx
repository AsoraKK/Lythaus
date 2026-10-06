import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';
import { formatDateTime } from '../utils/formatters.js';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';
import LythInput from '../components/LythInput.jsx';
import PageLayout from '../components/PageLayout.jsx';

const USERS_GUIDE = {
  title: 'Keeper account operations',
  summary: 'Review registered account records and apply controlled, reason-coded administrative actions.',
  items: [
    'Search by account id, display name, or handle.',
    'Exact email lookup is owner-only under Account support; this list does not return contact addresses.',
    'Every mutation requires a stable policy reason and typed confirmation.',
    'Profile editing is unavailable because the canonical admin role has no social-profile write permission.'
  ],
  footnote: 'Cloudflare Access and active administrator membership are enforced by the admin API.'
};

const STATUS_OPTIONS = ['', 'active', 'relink_required', 'suspended', 'locked', 'deleted'];

function Users({ inWorkspace = false }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [action, setAction] = useState(null);
  const [reasonCode, setReasonCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [invite, setInvite] = useState({ email: '', displayName: '', handle: '', reasonCode: '', confirmation: '' });
  const [inviteMessage, setInviteMessage] = useState('');

  const loadUsers = useCallback(async ({ cursor = null, append = false } = {}) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError('');
    try {
      const response = await adminRequest('users', { query: { q: query.trim(), status, createdAfter, createdBefore, limit: 50, cursor } });
      const received = Array.isArray(response?.items) ? response.items : [];
      setItems((current) => append ? [...current, ...received] : received);
      setNextCursor(response?.nextCursor || null);
    } catch (requestError) {
      if (requestError.status === 401 || requestError.status === 403) {
        setItems([]); setNextCursor(null); setSelected(null); setDetail(null);
        setError(requestError.status === 403 ? 'Administrator access is required to view registered accounts.' : 'Sign in through approved admin access to view registered accounts.');
      } else {
        if (!append) { setItems([]); setNextCursor(null); }
        setError('User data could not be loaded.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [createdAfter, createdBefore, query, status]);

  useEffect(() => { loadUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectUser = async (user) => {
    setSelected(user);
    setDetail(null);
    setActionMessage('');
    try {
      const response = await adminRequest(`users/${encodeURIComponent(user.id)}`);
      setDetail(response?.user || user);
    } catch (requestError) {
      if (requestError.status === 401 || requestError.status === 403) {
        setItems([]); setNextCursor(null); setSelected(null); setDetail(null);
        setError(requestError.status === 403 ? 'Administrator access is required to review this account.' : 'Sign in through approved admin access to review this account.');
      } else {
        setDetail(user);
      }
    }
  };

  const beginAction = (nextAction) => {
    setAction(nextAction);
    setReasonCode('');
    setConfirmation('');
    setActionMessage('');
  };

  const runAction = async () => {
    if (!selected || !action) return;
    const normalizedReason = reasonCode.trim().toUpperCase();
    if (!/^[A-Z0-9_.:-]{2,80}$/.test(normalizedReason)) {
      setActionMessage('A stable policy reason code is required.');
      return;
    }
    const expected = action === 'suspend' ? 'SUSPEND ACCOUNT'
      : action === 'reactivate' ? 'REACTIVATE ACCOUNT'
        : action === 'lock' ? 'LOCK ACCOUNT'
          : action === 'resend' ? 'RESEND VERIFICATION'
            : action === 'revoke' ? 'REVOKE SESSIONS' : `DELETE ${selected.id}`;
    if (confirmation.trim() !== expected) {
      setActionMessage(`Type ${expected} to confirm this action.`);
      return;
    }
    setActionBusy(true);
    setActionMessage('');
    try {
      if (action === 'resend') {
        await adminRequest(`users/${selected.id}/resend-verification`, { method: 'POST', body: { reasonCode: normalizedReason, confirmation } });
      } else if (action === 'revoke') {
        await adminRequest(`users/${selected.id}/revoke-sessions`, { method: 'POST', body: { reasonCode: normalizedReason, confirmation } });
      } else if (action === 'delete') {
        await adminRequest(`users/${selected.id}`, { method: 'DELETE', body: { reasonCode: normalizedReason, confirmation }, headers: { 'Idempotency-Key': idempotencyKey() } });
      } else {
        const statusValue = action === 'reactivate' ? 'active' : action === 'suspend' ? 'suspended' : 'locked';
        await adminRequest(`users/${selected.id}/status`, { method: 'POST', body: { status: statusValue, reasonCode: normalizedReason, confirmation } });
      }
      setActionMessage('Action recorded.');
      setAction(null);
      setConfirmation('');
      await loadUsers();
      await selectUser({ ...selected, status: action === 'reactivate' ? 'active' : action === 'suspend' ? 'suspended' : action === 'lock' ? 'locked' : selected.status });
    } catch {
      setActionMessage('The requested account action could not be completed.');
    } finally {
      setActionBusy(false);
    }
  };

  const submitInvite = async (event) => {
    event.preventDefault();
    setInviteMessage('');
    const normalizedReason = invite.reasonCode.trim().toUpperCase();
    if (!/^[A-Z0-9_.:-]{2,80}$/.test(normalizedReason) || invite.confirmation.trim() !== 'INVITE ACCOUNT') {
      setInviteMessage('Enter a stable reason code and type INVITE ACCOUNT to confirm.');
      return;
    }
    setActionBusy(true);
    try {
      await adminRequest('users', { method: 'POST', body: { email: invite.email, displayName: invite.displayName || undefined, handle: invite.handle || undefined, reasonCode: normalizedReason, confirmation: invite.confirmation } });
      setInvite({ email: '', displayName: '', handle: '', reasonCode: '', confirmation: '' });
      setInviteMessage('Invitation queued for delivery.');
      await loadUsers();
    } catch {
      setInviteMessage('The invitation could not be queued; email delivery may still be pending configuration.');
    } finally {
      setActionBusy(false);
    }
  };

  const submitSearch = (event) => {
    event.preventDefault();
    if (query.includes('@')) {
      setItems([]);
      setNextCursor(null);
      setError('Exact email lookup is available only in the owner-only Account support tab.');
      return;
    }
    loadUsers();
  };

  return (
    <PageLayout title={inWorkspace ? 'Account administration' : 'Users'} headingLevel={inWorkspace ? 2 : 1} subtitle="Registered accounts across all statuses. Existing administrator and owner permissions apply." guide={USERS_GUIDE}>
      <LythCard variant="panel">
        <div className="panel-header"><h2>Find accounts</h2><LythButton variant="ghost" type="button" onClick={() => loadUsers()} disabled={loading}>Refresh</LythButton></div>
        <p className="muted">This list shows account identity and access state only. Exact email lookup and recorded support history remain owner-only in Account support.</p>
        <form className="form-row" onSubmit={submitSearch}>
          <LythInput type="text" aria-label="Search registered accounts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search account ID, display name, or handle" />
          <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((value) => <option key={value} value={value}>{value || 'All statuses'}</option>)}
          </select>
          <LythInput type="datetime-local" aria-label="Created after" value={createdAfter} onChange={(event) => setCreatedAfter(event.target.value)} />
          <LythInput type="datetime-local" aria-label="Created before" value={createdBefore} onChange={(event) => setCreatedBefore(event.target.value)} />
          <LythButton type="submit" disabled={loading}>Search</LythButton>
        </form>
        {error ? <div className="notice error" role="alert">{error}</div> : null}
        {loading ? <p aria-live="polite">Loading users...</p> : null}
        {!loading && !error && !items.length ? <div className="empty-state">No registered accounts match these filters.</div> : null}
        {items.length ? (
          <div className="data-table users-data-table" role="table" aria-label="Registered accounts">
            <div className="data-row header" role="row"><span role="columnheader">Account</span><span role="columnheader">Status</span><span role="columnheader">Created</span><span role="columnheader">Active sessions</span><span role="columnheader">Plan</span><span role="columnheader">Actions</span></div>
            {items.map((user) => <div key={user.id} className="data-row" role="row">
              <span role="cell"><strong>{user.displayName || user.handle || 'User'}</strong>{user.handle ? <span className="muted">@{user.handle}</span> : null}<span className="muted user-account-id">{user.id}</span></span>
              <span role="cell"><span className={`status-pill ${String(user.status).toLowerCase()}`}>{user.status}</span></span>
              <span role="cell">{formatDateTime(user.createdAt)}</span>
              <span role="cell">{user.currentSessionCount ?? 'Unknown'}</span>
              <span role="cell">{user.subscriptionTier || 'Unknown'}</span>
              <span role="cell"><LythButton variant="ghost" type="button" onClick={() => selectUser(user)}>Review</LythButton></span>
            </div>)}
          </div>
        ) : null}
        {nextCursor && !loading ? <LythButton variant="secondary" type="button" onClick={() => loadUsers({ cursor: nextCursor, append: true })} disabled={loadingMore}>{loadingMore ? 'Loading...' : 'Load more'}</LythButton> : null}
      </LythCard>

      <LythCard variant="panel">
        <div className="panel-header"><h2>Invite account</h2></div>
        <p className="muted">The recipient creates their own password after verifying the invitation.</p>
        <form className="form-grid" onSubmit={submitInvite}>
          <label className="field"><span className="field-label">Email</span><LythInput type="email" required value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} /></label>
          <label className="field"><span className="field-label">Display name</span><LythInput value={invite.displayName} onChange={(event) => setInvite({ ...invite, displayName: event.target.value })} /></label>
          <label className="field"><span className="field-label">Handle</span><LythInput value={invite.handle} onChange={(event) => setInvite({ ...invite, handle: event.target.value })} /></label>
          <label className="field"><span className="field-label">Reason code</span><LythInput required value={invite.reasonCode} onChange={(event) => setInvite({ ...invite, reasonCode: event.target.value })} placeholder="BETA_INVITE" /></label>
          <label className="field"><span className="field-label">Type INVITE ACCOUNT</span><LythInput required value={invite.confirmation} onChange={(event) => setInvite({ ...invite, confirmation: event.target.value })} /></label>
          <div className="panel-actions"><LythButton type="submit" disabled={actionBusy}>Invite</LythButton></div>
        </form>
        {inviteMessage ? <div className="notice" role="status">{inviteMessage}</div> : null}
      </LythCard>

      <LythCard variant="panel">
        <div className="panel-header"><h2>Keeper actions</h2></div>
        <div className="notice capability-unavailable" role="note">Profile editing is unavailable in this admin view. The canonical admin role does not have the social-profile write permission required to edit app profiles.</div>
        {!selected ? <div className="empty-state">Review an account to see controlled actions.</div> : (
          <>
            <div className="detail-list">
              <div><span className="detail-label">Account ID</span><span className="user-account-id">{selected.id}</span></div>
              <div><span className="detail-label">Status</span><span className={`status-pill ${String((detail || selected).status).toLowerCase()}`}>{(detail || selected).status}</span></div>
              <div><span className="detail-label">Plan</span><span>{detail?.subscriptionTier || selected.subscriptionTier || 'Unknown'}</span></div>
              <div><span className="detail-label">Last sign-in or account creation</span><span>{formatDateTime(detail?.lastLoginAt || selected.lastLoginAt || selected.createdAt)}</span></div>
              <div><span className="detail-label">Active sessions</span><span>{detail?.currentSessionCount ?? selected.currentSessionCount ?? 'Unknown'}</span></div>
              <div><span className="detail-label">Contact lookup</span><span>Owner-only in Account support</span></div>
            </div>
            {actionMessage ? <div className="notice" role="status">{actionMessage}</div> : null}
            {!action ? <div className="panel-actions">
              <LythButton variant="danger" type="button" onClick={() => beginAction('suspend')}>Suspend</LythButton>
              <LythButton variant="secondary" type="button" onClick={() => beginAction('reactivate')}>Reactivate</LythButton>
              <LythButton variant="danger" type="button" onClick={() => beginAction('lock')}>Lock</LythButton>
              <LythButton variant="ghost" type="button" onClick={() => beginAction('resend')}>Resend verification</LythButton>
              <LythButton variant="ghost" type="button" onClick={() => beginAction('revoke')}>Revoke sessions</LythButton>
              <LythButton variant="danger" type="button" onClick={() => beginAction('delete')}>Delete</LythButton>
            </div> : (
              <div className="form-grid">
                <label className="field"><span className="field-label">Reason code</span><LythInput value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} placeholder="SECURITY_REMEDIATION" /></label>
                <label className="field"><span className="field-label">Type {action === 'delete' ? `DELETE ${selected.id}` : action === 'suspend' ? 'SUSPEND ACCOUNT' : action === 'reactivate' ? 'REACTIVATE ACCOUNT' : action === 'lock' ? 'LOCK ACCOUNT' : action === 'resend' ? 'RESEND VERIFICATION' : 'REVOKE SESSIONS'}</span><LythInput value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
                <div className="panel-actions"><LythButton variant="danger" type="button" onClick={runAction} disabled={actionBusy}>Confirm action</LythButton><LythButton variant="ghost" type="button" onClick={() => setAction(null)} disabled={actionBusy}>Cancel</LythButton></div>
              </div>
            )}
          </>
        )}
      </LythCard>
    </PageLayout>
  );
}

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `keeper-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default Users;
