import { useEffect, useMemo, useRef, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';
import PageLayout from '../components/PageLayout.jsx';
import './support-feedback.css';

const KINDS = [
  { path: 'problems', label: 'Problem reports', kind: 'problem' },
  { path: 'suggestions', label: 'Suggestions', kind: 'suggestion' },
];

function readable(value) {
  return String(value ?? '').replaceAll('_', ' ').replaceAll('-', ' ');
}

function requestPath(kind, requestId = '') {
  const root = kind === 'problem' ? 'problems' : 'suggestions';
  return `support/${root}${requestId ? `/${encodeURIComponent(requestId)}` : ''}`;
}

function safeError(error) {
  if (error?.status === 401 || error?.status === 403) return 'Active owner access is required to review private support requests.';
  if (error?.status === 409) return 'The request changed. Reload it and review the latest history.';
  if (error?.status === 429) return 'Support actions are temporarily limited. Try again later.';
  return 'Support requests are currently unavailable. No action was confirmed.';
}

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

function validOptions(value) {
  const requiredServiceLimits = ['page', 'messages', 'privateItems', 'messageBytes', 'noteBytes', 'evidenceBytes', 'referenceBytes'];
  return value && typeof value.version === 'string'
    && value.contract?.categories?.problem?.length && value.contract?.categories?.suggestion?.length
    && Number.isSafeInteger(value.contract?.limits?.memberMessageBytes) && value.contract.limits.memberMessageBytes > 0
    && requiredServiceLimits.every(key => Number.isSafeInteger(value.limits?.[key]) && value.limits[key] > 0)
    && Array.isArray(value.transitions) && Array.isArray(value.evidenceTypes);
}

function SupportFeedback() {
  const [access, setAccess] = useState('loading');
  const [options, setOptions] = useState(null);
  const [kind, setKind] = useState(KINDS[0].kind);
  const [queue, setQueue] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [evidenceType, setEvidenceType] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [decisionChoice, setDecisionChoice] = useState('');
  const [decisionMessage, setDecisionMessage] = useState('');
  const [selectedEvidence, setSelectedEvidence] = useState([]);
  const queueVersion = useRef(0);
  const detailVersion = useRef(0);
  const operationKeys = useRef(new Map());

  const transitions = useMemo(() => (options?.transitions ?? [])
    .filter(item => item.kind === detail?.request?.kind && item.from === detail?.request?.state), [options, detail]);
  const decisionOptions = useMemo(() => transitions.flatMap((transition, index) => transition.reasons.map(reason => ({
    value: `${index}:${reason}`, transition, reason,
  }))), [transitions]);
  const selectedDecision = decisionOptions.find(item => item.value === decisionChoice);
  const selectedTransition = selectedDecision?.transition;
  const decisionEvidence = useMemo(() => {
    if (!detail?.private?.evidence || !selectedTransition) return [];
    return detail.private.evidence.filter(item => selectedTransition.evidenceTypes.includes(item.type));
  }, [detail, selectedTransition]);
  const selectedEvidenceSet = new Set(selectedEvidence);
  const selectedDecisionEvidence = decisionEvidence.filter(item => selectedEvidenceSet.has(item.id));
  const hasEveryRequiredEvidence = (selectedTransition?.evidenceTypes ?? [])
    .every(type => selectedDecisionEvidence.some(item => item.type === type));
  const publicMessageLimit = Math.min(options?.limits?.messageBytes ?? 1, options?.contract?.limits?.memberMessageBytes ?? 1);
  const fitsBytes = (value, limit) => byteLength(value) <= limit;

  useEffect(() => {
    let active = true;
    adminRequest('support/options').then(value => {
      if (!active) return;
      if (!validOptions(value)) throw new Error('invalid support policy');
      setOptions(value);
      setAccess('ready');
      return loadQueue(KINDS[0].kind, value, null, () => active);
    }).catch(reason => {
      if (!active) return;
      setAccess(reason?.status === 401 || reason?.status === 403 ? 'denied' : 'unavailable');
      setError(safeError(reason));
    });
    return () => {
      active = false;
      queueVersion.current += 1;
      detailVersion.current += 1;
    };
  }, []);

  async function loadQueue(nextKind, config = options, cursor = null, active = () => true) {
    if (!config) return;
    const version = ++queueVersion.current;
    setLoadingQueue(true);
    setError('');
    try {
      const result = await adminRequest(requestPath(nextKind), {
        query: { limit: config.limits.page, cursor },
      });
      if (!active() || version !== queueVersion.current) return;
      if (!Array.isArray(result?.items)) throw new Error('invalid support queue');
      setQueue(current => cursor ? [...current, ...result.items] : result.items);
      setNextCursor(result.nextCursor || null);
      setLoadingQueue(false);
    } catch (reason) {
      if (!active() || version !== queueVersion.current) return;
      failClosed(reason);
      setLoadingQueue(false);
    }
  }

  async function loadDetail(item, { preserveStatus = false } = {}) {
    const version = ++detailVersion.current;
    setSelected(item);
    setDetail(null);
    setLoadingDetail(true);
    setError('');
    if (!preserveStatus) setStatus('');
    setReply('');
    setNote('');
    setEvidenceType('');
    setEvidenceDescription('');
    setEvidenceReference('');
    setDecisionChoice('');
    setDecisionMessage('');
    setSelectedEvidence([]);
    try {
      const value = await adminRequest(requestPath(item.kind, item.id));
      if (version !== detailVersion.current) return;
      if (!value?.request || !Array.isArray(value?.messages) || !value.private) throw new Error('invalid support detail');
      setDetail(value);
      setLoadingDetail(false);
    } catch (reason) {
      if (version !== detailVersion.current) return;
      failClosed(reason);
      setLoadingDetail(false);
    }
  }

  function failClosed(reason) {
    setQueue([]);
    setSelected(null);
    setDetail(null);
    setNextCursor(null);
    setError(safeError(reason));
    setAccess(reason?.status === 401 || reason?.status === 403 ? 'denied' : 'unavailable');
  }

  async function mutate(action, body, suffix = 'messages') {
    if (!selected || !detail || busy) return;
    const selectedAtStart = selected;
    const kindAtStart = kind;
    const detailVersionAtStart = detailVersion.current;
    const fingerprint = `${action}:${selectedAtStart.id}:${JSON.stringify(body)}`;
    const key = operationKeys.current.get(fingerprint) ?? `support-${crypto.randomUUID()}`;
    operationKeys.current.set(fingerprint, key);
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await adminRequest(`${requestPath(selected.kind, selected.id)}/${suffix}`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': key },
      });
      operationKeys.current.delete(fingerprint);
      setStatus(action);
      if (detailVersion.current === detailVersionAtStart) {
        setReply('');
        setNote('');
        setEvidenceDescription('');
        setEvidenceReference('');
        setDecisionMessage('');
        setSelectedEvidence([]);
        await loadDetail(selectedAtStart, { preserveStatus: true });
      }
      await loadQueue(kindAtStart);
      setBusy(false);
    } catch (reason) {
      setBusy(false);
      failClosed(reason);
    }
  }

  function selectKind(nextKind) {
    if (nextKind === kind || busy) return;
    detailVersion.current += 1;
    setKind(nextKind);
    setQueue([]);
    setSelected(null);
    setDetail(null);
    setLoadingDetail(false);
    setStatus('');
    if (options) loadQueue(nextKind, options);
  }

  function clearSelection() {
    detailVersion.current += 1;
    setSelected(null);
    setDetail(null);
    setLoadingDetail(false);
    setError('');
    setStatus('');
  }

  function time(value) {
    return value ? `${new Date(value).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC` : 'Not recorded';
  }

  return <PageLayout title="Support" subtitle="Private problem reports and suggestions · owner-only triage" className="support-feedback">
    {access === 'loading' ? <p role="status">Checking owner access and support availability…</p> : null}
    {access === 'denied' ? <div className="notice error" role="alert">Active owner access is required to review private support requests.</div> : null}
    {access === 'unavailable' ? <div className="notice error" role="alert">{error || 'Support requests are currently unavailable. No action was confirmed.'}</div> : null}
    {access === 'ready' ? <>
      <div className="support-kind-tabs" role="group" aria-label="Support queue">
        {KINDS.map(item => <button key={item.kind} type="button" disabled={busy} aria-pressed={kind === item.kind} className={kind === item.kind ? 'selected' : ''} onClick={() => selectKind(item.kind)}>{item.label}</button>)}
      </div>
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      {status ? <div className="notice" role="status">{status}</div> : null}
      <div className="support-layout">
        <LythCard variant="panel" className="support-queue">
          <div className="support-panel-heading"><h2>{kind === 'problem' ? 'Problem reports' : 'Suggestions'}</h2><LythButton variant="secondary" disabled={loadingQueue} onClick={() => loadQueue(kind)}>Refresh</LythButton></div>
          {loadingQueue ? <p role="status">Loading private queue…</p> : null}
          {!loadingQueue && !queue.length && !error ? <p className="muted">No {kind === 'problem' ? 'problem reports' : 'suggestions'} in this queue.</p> : null}
          <ol className="support-queue-list">
            {queue.map(item => <li key={item.id}>
              <button type="button" className={selected?.id === item.id ? 'support-request selected' : 'support-request'} onClick={() => loadDetail(item)}>
                <strong>{item.title}</strong>
                <span>{readable(item.category)} · {readable(item.state)}</span>
                <span>{time(item.updatedAt)}</span>
              </button>
            </li>)}
          </ol>
          {nextCursor ? <LythButton variant="secondary" disabled={loadingQueue} onClick={() => loadQueue(kind, options, nextCursor)}>Load more</LythButton> : null}
        </LythCard>
        <LythCard variant="panel" className="support-detail">
          {!selected ? <div className="empty-state">Select an item to review its member-visible conversation and private records.</div> : null}
          {loadingDetail ? <p role="status">Loading private request…</p> : null}
          {detail ? <>
            <div className="support-panel-heading"><div><h2>{detail.request.title}</h2><p className="muted">{readable(detail.request.category)} · {readable(detail.request.state)}</p></div><LythButton variant="ghost" disabled={busy} onClick={clearSelection}>Close detail</LythButton></div>
            <dl className="support-facts">
              <div><dt>Request ID</dt><dd>{detail.request.id}</dd></div>
              <div><dt>Submitter account</dt><dd>{detail.request.submitterId}</dd></div>
              <div><dt>Created</dt><dd>{time(detail.request.createdAt)}</dd></div>
              <div><dt>Updated</dt><dd>{time(detail.request.updatedAt)}</dd></div>
            </dl>
            {detail.request.kind === 'problem' ? <div className="support-content-grid"><section><h3>What happened</h3><p>{detail.request.actual}</p></section><section><h3>Expected behavior</h3><p>{detail.request.expected}</p></section>{detail.request.reproductionSteps ? <section><h3>Reproduction steps</h3><p>{detail.request.reproductionSteps}</p></section> : null}</div> : <div className="support-content-grid"><section><h3>Suggested change</h3><p>{detail.request.improvement}</p></section><section><h3>Expected benefit</h3><p>{detail.request.benefit}</p></section></div>}
            <section className="support-section"><h3>Member conversation</h3>
              {!detail.messages.length ? <p className="muted">No messages recorded.</p> : <ol className="support-messages">{detail.messages.map(item => <li key={item.id}><strong>{item.from === 'owner' ? 'Support' : 'Member'} · {time(item.createdAt)}</strong><p>{item.text}</p></li>)}</ol>}
              <label className="support-field"><span>Reply to member</span><textarea aria-label="Reply to member" rows="3" maxLength={publicMessageLimit} disabled={busy} value={reply} onChange={event => setReply(event.target.value)} /><small>{byteLength(reply)} / {publicMessageLimit} UTF-8 bytes</small></label>
              <LythButton disabled={busy || !reply.trim() || !fitsBytes(reply, publicMessageLimit)} onClick={() => mutate('Reply saved.', { expectedRevision: detail.request.revision, message: reply.trim() }, 'messages')}>{busy ? 'Saving…' : 'Send reply'}</LythButton>
            </section>
            <section className="support-section"><h3>Owner-only notes</h3>
              {!detail.private.notes.length ? <p className="muted">No private notes recorded.</p> : <ul>{detail.private.notes.map(item => <li key={item.id}><p>{item.text}</p><span>{time(item.createdAt)}</span></li>)}</ul>}
              <label className="support-field"><span>Internal note</span><textarea aria-label="Internal note" rows="3" maxLength={options.limits.noteBytes} disabled={busy} value={note} onChange={event => setNote(event.target.value)} /><small>{byteLength(note)} / {options.limits.noteBytes} UTF-8 bytes</small></label>
              <LythButton variant="secondary" disabled={busy || !note.trim() || !fitsBytes(note, options.limits.noteBytes)} onClick={() => mutate('Private note saved.', { expectedRevision: detail.request.revision, text: note.trim() }, 'notes')}>Save private note</LythButton>
            </section>
            <section className="support-section"><h3>Verification evidence</h3>
              {!detail.private.evidence.length ? <p className="muted">No verification evidence recorded.</p> : <ul>{detail.private.evidence.map(item => <li key={item.id}><p><strong>{readable(item.type)}</strong> · {item.description}</p>{item.reference ? <p className="support-reference">{item.reference}</p> : null}<span>{time(item.createdAt)}</span></li>)}</ul>}
              <div className="support-evidence-form">
                <label className="support-field"><span>Evidence type</span><select aria-label="Evidence type" disabled={busy} value={evidenceType} onChange={event => setEvidenceType(event.target.value)}><option value="">Choose type</option>{options.evidenceTypes.map(value => <option value={value} key={value}>{readable(value)}</option>)}</select></label>
                <label className="support-field"><span>Evidence description</span><textarea aria-label="Evidence description" rows="2" maxLength={options.limits.evidenceBytes} disabled={busy} value={evidenceDescription} onChange={event => setEvidenceDescription(event.target.value)} /><small>{byteLength(evidenceDescription)} / {options.limits.evidenceBytes} UTF-8 bytes</small></label>
                <label className="support-field"><span>Evidence reference (optional)</span><input aria-label="Evidence reference (optional)" maxLength={options.limits.referenceBytes} disabled={busy} value={evidenceReference} onChange={event => setEvidenceReference(event.target.value)} /><small>{byteLength(evidenceReference)} / {options.limits.referenceBytes} UTF-8 bytes</small></label>
              </div>
              <LythButton variant="secondary" disabled={busy || !evidenceType || !evidenceDescription.trim() || !fitsBytes(evidenceDescription, options.limits.evidenceBytes) || !fitsBytes(evidenceReference, options.limits.referenceBytes)} onClick={() => mutate('Evidence recorded.', { expectedRevision: detail.request.revision, type: evidenceType, description: evidenceDescription.trim(), ...(evidenceReference.trim() ? { reference: evidenceReference.trim() } : {}) }, 'evidence')}>Record evidence</LythButton>
            </section>
            <section className="support-section"><h3>Decision</h3>
              {!transitions.length ? <p className="muted">No configured decision is available from this state.</p> : <>
                <label className="support-field"><span>Allowed next step</span><select aria-label="Allowed next step" disabled={busy} value={decisionChoice} onChange={event => { setDecisionChoice(event.target.value); setSelectedEvidence([]); }}><option value="">Choose transition</option>{decisionOptions.map(item => <option key={item.value} value={item.value}>{readable(item.transition.to)} · {readable(item.reason)}</option>)}</select></label>
                {selectedTransition?.evidenceTypes?.length ? <fieldset className="support-evidence-select"><legend>Evidence required for this decision</legend>
                  {!decisionEvidence.length ? <p className="muted">Record matching verification evidence before this decision can be saved.</p> : decisionEvidence.map(item => <label key={item.id}><input type="checkbox" disabled={busy} checked={selectedEvidence.includes(item.id)} onChange={event => setSelectedEvidence(values => event.target.checked ? [...values, item.id] : values.filter(value => value !== item.id))} />{readable(item.type)} · {item.description}</label>)}
                </fieldset> : null}
                <label className="support-field"><span>Message shown to the member</span><textarea aria-label="Message shown to the member" rows="3" maxLength={publicMessageLimit} disabled={busy} value={decisionMessage} onChange={event => setDecisionMessage(event.target.value)} /><small>{byteLength(decisionMessage)} / {publicMessageLimit} UTF-8 bytes</small></label>
                <LythButton disabled={busy || !selectedTransition || !decisionMessage.trim() || !fitsBytes(decisionMessage, publicMessageLimit) || !hasEveryRequiredEvidence} onClick={() => mutate('Decision saved.', { expectedRevision: detail.request.revision, state: selectedTransition.to, reason: selectedDecision.reason, memberMessage: decisionMessage.trim(), evidenceIds: selectedDecisionEvidence.map(item => item.id) }, 'decision')}>Save decision</LythButton>
              </>}
            </section>
          </> : null}
        </LythCard>
      </div>
    </> : null}
  </PageLayout>;
}

export default SupportFeedback;
