import { useEffect, useState } from 'react';
import { adminRequest } from '../api/adminApi.js';
import LythButton from '../components/LythButton.jsx';
import LythCard from '../components/LythCard.jsx';
import PageLayout from '../components/PageLayout.jsx';

export default function AuthenticityBeta() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    adminRequest('authenticity/cases').then(value => { if (active) setItems(value.items); }).catch(() => { if (active) setError('Private beta cases are unavailable.'); });
    return () => { active = false; };
  }, []);
  async function select(caseId) {
    setBusy(true); setError('');
    try { setSelected(await adminRequest(`authenticity/cases/${caseId}`)); setMessage(''); }
    catch { setError('The case could not be opened.'); }
    finally { setBusy(false); }
  }
  async function submit(action) {
    setBusy(true); setError('');
    try {
      await adminRequest(`authenticity/cases/${selected.caseId}/${action}`, { method: 'POST', body: { message } });
      setSelected(await adminRequest(`authenticity/cases/${selected.caseId}`)); setMessage('');
    } catch { setError(action === 'retry' ? 'Retry is unavailable or its attempt has already been consumed.' : 'Review could not be recorded.'); }
    finally { setBusy(false); }
  }
  return <PageLayout title="Authenticity beta" subtitle="Private experimental evidence. Reviews do not certify authorship, publish content, or affect rewards.">
    {error && <p role="alert" className="notice error">{error}</p>}
    <div className="page-grid">
      <LythCard variant="panel"><h2>Cases</h2>{items.length === 0 && <p>No private cases are available.</p>}
        {items.map(item => <div key={item.caseId} className="detail-list"><p>{item.status} · Review: {item.reviewState}</p><LythButton disabled={busy} onClick={() => select(item.caseId)}>Open {item.caseId}</LythButton></div>)}
      </LythCard>
      <LythCard variant="panel"><h2>Case review</h2>{selected && <>
        <p>{selected.explanation}</p><p>{selected.status} · {selected.advisoryStatus}</p>
        {['complete', 'inconclusive', 'unsupported'].includes(selected.status) && <img src={`/api/admin/authenticity/cases/${selected.caseId}/image`} alt="Private image submitted for review" style={{maxWidth:'100%',maxHeight:400,objectFit:'contain'}} />}
        <p>{selected.limitations.join(' ')}</p>
        <details><summary>Audited diagnostics</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(selected.diagnostics,null,2)}</pre></details>
        <h3>Feedback and review history</h3>{selected.feedback.map(entry => <p key={entry.id}>{entry.kind}: {entry.message}</p>)}
        <label>Versioned review explanation<textarea value={message} maxLength={2000} onChange={event=>setMessage(event.target.value)} /></label>
        <LythButton disabled={busy || !message.trim()} onClick={()=>submit('review')}>Record private review</LythButton>
        {['paused','failed'].includes(selected.status) && <LythButton disabled={busy || !message.trim()} onClick={()=>submit('retry')}>Retry unfinished work</LythButton>}
      </>}</LythCard>
    </div>
  </PageLayout>;
}
