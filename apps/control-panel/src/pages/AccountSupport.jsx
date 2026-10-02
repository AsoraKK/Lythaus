import { useEffect, useRef, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';
import LythInput from '../components/LythInput.jsx';
import PageLayout from '../components/PageLayout.jsx';
import './account-support.css';

const EMPTY_FILTERS = { source: '', eventType: '', correlationId: '', since: '', until: '', order: 'newest' };
const HISTORY_NOTICE = 'This is partial recorded history. Events may never have been recorded or may have expired or been removed. An empty result does not prove that no activity occurred. Identity account events do not record correlation IDs.';
const GUIDE = {
  title: 'Read-only support',
  summary: 'Owners can review one account using its exact email address. Each lookup and history request records a support reason.',
  items: ['Enter the complete email and a stable reason code.', 'Review account state and recorded events.', 'Filter by source, event code, dates or correlation ID.', 'Use Clear when the review is finished.'],
  footnote: 'Account changes and reputation repair require separate review.'
};

function time(value) {
  return value ? `${new Date(value).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC` : 'Not recorded';
}

function historyBody(reasonCode, filters, cursor = null) {
  const date = value => value ? new Date(value).toISOString() : null;
  return { reasonCode, source: filters.source || null, eventType: filters.eventType.trim() || null,
    correlationId: filters.correlationId.trim() || null, since: date(filters.since), until: date(filters.until),
    order: filters.order, limit: 25, cursor };
}

function AccountSupport() {
  const [access, setAccess] = useState('loading');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [account, setAccount] = useState(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyState, setHistoryState] = useState('idle');
  const [historyError, setHistoryError] = useState('');
  const [correlation, setCorrelation] = useState(null);
  const version = useRef(0);

  useEffect(() => {
    let active = true;
    adminRequest('account-support/access').then(response => {
      if (active) setAccess(response?.available === true ? 'ready' : 'unavailable');
    }).catch(error => { if (active) setAccess(error.status === 403 ? 'denied' : 'unavailable'); });
    return () => { active = false; version.current += 1; };
  }, []);

  function clearResults() {
    version.current += 1;
    setAccount(null); setItems([]); setNextCursor(null); setMessage(''); setHistoryError('');
    setCorrelation(null); setHistoryState('idle'); setLookupBusy(false); setHistoryBusy(false);
    setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS);
  }

  async function loadHistory(selected, selectedReason, selectedFilters, cursor, token) {
    setHistoryBusy(true); setHistoryError('');
    if (!cursor) { setItems([]); setNextCursor(null); setHistoryState('loading'); }
    try {
      const response = await adminRequest(`account-support/users/${encodeURIComponent(selected.id)}/history`, {
        method: 'POST', body: historyBody(selectedReason, selectedFilters, cursor)
      });
      if (token !== version.current) return;
      if (!Array.isArray(response?.items) || response.coverage !== 'partial') throw new Error('Invalid history response');
      setItems(current => cursor ? [...current, ...response.items] : response.items);
      setNextCursor(response.nextCursor || null); setApplied(selectedFilters);
      setCorrelation(response.correlationId || null); setHistoryState('ready');
    } catch (error) {
      if (token !== version.current) return;
      if (error.status === 403 || error.status === 401) { clearResults(); setAccess('denied'); return; }
      setHistoryError(cursor ? 'More history could not be loaded. The displayed entries remain from the previous page.' : 'History could not be loaded. Try applying the filters again.');
      if (!cursor) setHistoryState('failed');
    } finally { if (token === version.current) setHistoryBusy(false); }
  }

  async function lookup(event) {
    event.preventDefault();
    clearResults();
    const normalizedReason = reason.trim().toUpperCase();
    if (!/^[A-Z0-9_.:-]{2,80}$/.test(normalizedReason)) { setMessage('Enter a stable reason code such as SUPPORT_REQUEST.'); return; }
    const token = version.current;
    setLookupBusy(true);
    try {
      const response = await adminRequest('account-support/lookup', { method: 'POST', body: { email: email.trim().toLowerCase(), reasonCode: normalizedReason } });
      if (token !== version.current) return;
      setCorrelation(response?.correlationId || null);
      if (response?.state === 'not_found') { setMessage('No account matched this exact email address.'); return; }
      if (response?.state === 'ambiguous') { setMessage('This address has conflicting account records. The lookup returned no account details.'); return; }
      if (response?.state !== 'found' || !response.account?.id) throw new Error('Invalid account response');
      setAccount(response.account);
      await loadHistory(response.account, normalizedReason, EMPTY_FILTERS, null, token);
    } catch (error) {
      if (token !== version.current) return;
      if (error.status === 403 || error.status === 401) { clearResults(); setAccess('denied'); return; }
      setMessage('Account support could not be loaded. Try the lookup again.');
    } finally { if (token === version.current) setLookupBusy(false); }
  }

  function applyFilters(event) {
    event.preventDefault();
    loadHistory(account, reason.trim().toUpperCase(), { ...filters }, null, ++version.current);
  }

  function correlate(value) {
    const selectedFilters = { ...applied, source: '', eventType: '', correlationId: value };
    setFilters(selectedFilters);
    loadHistory(account, reason.trim().toUpperCase(), selectedFilters, null, ++version.current);
  }

  return <PageLayout title="Account support" subtitle="Owner access · exact-email lookup · read-only account review" guide={GUIDE} className="account-support">
    {access === 'loading' ? <p role="status">Checking owner access...</p> : null}
    {access === 'denied' ? <div className="notice error" role="alert">Active owner access is required for account support.</div> : null}
    {access === 'unavailable' ? <div className="notice error" role="alert">Owner access could not be checked. Reload this page to retry.</div> : null}
    {access === 'ready' ? <>
      <LythCard variant="panel">
        <div className="panel-header"><h2>Exact-email lookup</h2><LythButton variant="ghost" onClick={() => { clearResults(); setEmail(''); setReason(''); }}>Clear</LythButton></div>
        <form className="support-fields" onSubmit={lookup}>
          <label className="field"><span className="field-label">Exact email address</span><LythInput type="email" required maxLength={320} autoComplete="off" value={email} onChange={event => { clearResults(); setEmail(event.target.value); }} /></label>
          <label className="field"><span className="field-label">Support reason code</span><LythInput required maxLength={80} autoComplete="off" placeholder="SUPPORT_REQUEST" value={reason} onChange={event => { clearResults(); setReason(event.target.value); }} /></label>
          <div className="panel-actions"><LythButton type="submit" disabled={lookupBusy || historyBusy}>{lookupBusy ? 'Looking up...' : 'Look up account'}</LythButton></div>
        </form>
        {message ? <div className="notice" role="status">{message}</div> : null}
        {correlation ? <p className="muted support-code">Review request: {correlation}</p> : null}
      </LythCard>
      {account ? <>
        <LythCard variant="panel">
          <div className="panel-header"><h2>Account state</h2><span className="status-pill">{account.status}</span></div>
          <dl className="support-state">
            <div><dt>Account ID</dt><dd>{account.id}</dd></div>
            <div><dt>Email verification</dt><dd>{account.verificationState}</dd></div>
            <div><dt>Verified at</dt><dd>{time(account.verifiedAt)}</dd></div>
            <div><dt>Created at</dt><dd>{time(account.createdAt)}</dd></div>
            <div><dt>Updated at</dt><dd>{time(account.updatedAt)}</dd></div>
            <div><dt>Deleted at</dt><dd>{time(account.deletedAt)}</dd></div>
            <div><dt>Last recorded email sign-in</dt><dd>{time(account.lastSignInAt)}</dd></div>
            <div><dt>Active sessions</dt><dd>{account.activeSessionCount}</dd></div>
            <div><dt>Subscription</dt><dd>{account.subscriptionTier}</dd></div>
          </dl>
        </LythCard>
        <LythCard variant="panel">
          <div className="panel-header"><h2>Recorded history</h2></div>
          <p className="notice">{HISTORY_NOTICE}</p>
          <form className="support-fields" onSubmit={applyFilters}>
            <label className="field"><span className="field-label">History source</span><select aria-label="History source" disabled={historyBusy || lookupBusy} value={filters.source} onChange={event => setFilters({ ...filters, source: event.target.value })}><option value="">All recorded sources</option><option value="account">Identity account events</option><option value="activity">User activity events</option><option value="audit">Account audit events</option></select></label>
            <label className="field"><span className="field-label">Event code</span><LythInput disabled={historyBusy || lookupBusy} maxLength={100} value={filters.eventType} onChange={event => setFilters({ ...filters, eventType: event.target.value })} placeholder="account.login_succeeded" /></label>
            <label className="field"><span className="field-label">Correlation ID</span><LythInput disabled={historyBusy || lookupBusy} maxLength={128} value={filters.correlationId} onChange={event => setFilters({ ...filters, correlationId: event.target.value })} /></label>
            <label className="field"><span className="field-label">Order</span><select aria-label="Order" disabled={historyBusy || lookupBusy} value={filters.order} onChange={event => setFilters({ ...filters, order: event.target.value })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
            <label className="field"><span className="field-label">Since (local time, inclusive)</span><LythInput type="datetime-local" disabled={historyBusy || lookupBusy} value={filters.since} onChange={event => setFilters({ ...filters, since: event.target.value })} /></label>
            <label className="field"><span className="field-label">Until (local time, exclusive)</span><LythInput type="datetime-local" disabled={historyBusy || lookupBusy} value={filters.until} onChange={event => setFilters({ ...filters, until: event.target.value })} /></label>
            <div className="panel-actions"><LythButton type="submit" disabled={historyBusy || lookupBusy}>Apply filters</LythButton></div>
          </form>
          {historyBusy ? <p role="status">Loading recorded history...</p> : null}
          {historyError ? <div className="notice error" role="alert">{historyError}</div> : null}
          {historyState === 'ready' ? <p className="muted">{items.length} recorded {items.length === 1 ? 'entry' : 'entries'} · {applied.order === 'oldest' ? 'Oldest first' : 'Newest first'} · Times shown in UTC</p> : null}
          {historyState === 'ready' && !items.length ? <div className="empty-state">No recorded events matched these filters.</div> : null}
          <ol className="timeline support-timeline" aria-label="Recorded account events">
            {items.map(item => <li className="timeline-item" key={`${item.source}:${item.id}`}>
              <time dateTime={item.createdAt}>{time(item.createdAt)}</time>
              <div><strong className="support-code">{item.eventType}</strong><p className="muted">{item.source} · {item.category || 'Category not recorded'}{item.outcome ? ` · ${item.outcome}` : ''}</p>
                {item.reasonCode ? <p className="support-code">Reason: {item.reasonCode}</p> : null}
                {item.correlationId ? <LythButton className="support-code" variant="ghost" disabled={historyBusy || lookupBusy} onClick={() => correlate(item.correlationId)} aria-label={`Filter correlation ${item.correlationId}`}>Correlation: {item.correlationId}</LythButton> : <p className="muted">Correlation: Not recorded</p>}
              </div>
            </li>)}
          </ol>
          {nextCursor ? <LythButton variant="secondary" disabled={historyBusy || lookupBusy} onClick={() => loadHistory(account, reason.trim().toUpperCase(), applied, nextCursor, ++version.current)}>Load more history</LythButton> : null}
        </LythCard>
      </> : null}
    </> : null}
  </PageLayout>;
}

export default AccountSupport;
