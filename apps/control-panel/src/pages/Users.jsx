import { useState } from 'react';
import { adminRequest } from '../api/adminApi.js';
import { formatDateTime } from '../utils/formatters.js';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';
import LythInput from '../components/LythInput.jsx';
import PageLayout from '../components/PageLayout.jsx';

const USERS_GUIDE = {
  title: 'What this page does',
  summary:
    'Users gives administrators direct account safety controls for search, suspension, and reactivation.',
  items: [
    'Search by user id, handle, or email to find the exact account.',
    'Review current status before taking action.',
    'Every status change requires a stable policy reason code.',
    'Reactivate only after remediation verification.',
    'Use locked only for the documented account-security workflow.'
  ],
  footnote:
    'User status actions are sensitive. Avoid ambiguous reason codes and ensure internal notes are decision-grade.'
};

function Users() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState(null);
  const [reasonCode, setReasonCode] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  const runSearch = async (event) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Enter a user id, handle, or email to search.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await adminRequest('users/search', {
        query: { q: trimmed }
      });
      setItems(response?.items || []);
      setSelected(null);
    } catch (err) {
      setError(err.message || 'Failed to search users.');
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (status) => {
    if (!selected) {
      return;
    }
    const trimmedReason = reasonCode.trim();
    const normalizedReason = trimmedReason.toUpperCase();
    if (!/^[A-Z0-9_.:-]{2,80}$/.test(normalizedReason)) {
      setActionMessage('A stable policy reason code is required.');
      return;
    }
    setActionBusy(true);
    setActionMessage('');
    try {
      await adminRequest(`users/${selected.id}/status`, {
        method: 'POST',
        body: {
          status,
          reasonCode: normalizedReason
        }
      });
      setReasonCode('');
      await runSearch({ preventDefault: () => {} });
    } catch (err) {
      setActionMessage(err.message || 'User update failed.');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <PageLayout
      title="Users"
      subtitle="Account safety operations for search, suspension, locking, and reactivation."
      guide={USERS_GUIDE}
    >
      <LythCard variant="panel">
        <form className="form-row" onSubmit={runSearch}>
          <LythInput
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by user id, handle, or email"
          />
          <LythButton type="submit" disabled={loading}>
            Search
          </LythButton>
        </form>
        {error ? <div className="notice error">{error}</div> : null}
        <div className="data-table">
          <div className="data-row header">
            <span>User</span>
            <span>Created</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {items.map((user) => (
            <div key={user.id} className="data-row">
              <span>
                <strong>{user.display_name || user.handle || 'User'}</strong>
                <span className="muted">{user.id}</span>
              </span>
              <span>{formatDateTime(user.created_at)}</span>
              <span>
                <span className={`status-pill ${String(user.status).toLowerCase()}`}>
                  {user.status}
                </span>
              </span>
              <span>
                <LythButton
                  variant="ghost"
                  type="button"
                  onClick={() => setSelected(user)}
                >
                  Select
                </LythButton>
              </span>
            </div>
          ))}
        </div>
        {!items.length && !loading ? (
          <div className="empty-state">No users found.</div>
        ) : null}
      </LythCard>
      <LythCard variant="panel">
        <div className="panel-header">
          <h2>Action</h2>
        </div>
        {!selected ? (
          <div className="empty-state">Select a user to suspend or reactivate.</div>
        ) : (
          <>
            <div className="detail-list">
              <div>
                <span className="detail-label">User id</span>
                <span>{selected.id}</span>
              </div>
              <div>
                <span className="detail-label">Status</span>
                <span className={`status-pill ${String(selected.status).toLowerCase()}`}>
                  {selected.status}
                </span>
              </div>
            </div>
            {actionMessage ? <div className="notice error">{actionMessage}</div> : null}
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Reason code</span>
                <LythInput
                  type="text"
                  value={reasonCode}
                  onChange={(event) => setReasonCode(event.target.value)}
                  placeholder="ABUSE_PATTERN"
                />
              </label>
            </div>
            <div className="panel-actions">
              <LythButton
                variant="danger"
                type="button"
                onClick={() => runAction('suspended')}
                disabled={actionBusy}
              >
                Suspend user
              </LythButton>
              <LythButton
                variant="secondary"
                type="button"
                onClick={() => runAction('active')}
                disabled={actionBusy}
              >
                Reactivate user
              </LythButton>
            </div>
          </>
        )}
      </LythCard>
    </PageLayout>
  );
}

export default Users;
