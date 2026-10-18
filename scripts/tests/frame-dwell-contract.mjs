import assert from 'node:assert/strict';
export function assertNoSemanticsDwell(result){
 assert.equal(result.snapshots.length,result.instrumented?3:2,'All fixed observations required');
 for(const snapshot of result.snapshots){
  assert.equal(snapshot.semanticsCount,0,'Semantics must stay disabled');
  if(result.instrumented)assert.equal(snapshot.probe.events.filter(e=>e.name==='semanticsState').at(-1)?.detail,'disabled');
 }
 const last=result.snapshots.at(-1);
 assert.ok(last.captureStartedAt-result.anchorAt>=5250,'Full no-semantics dwell required');
 const requests=last.probe?.counts['diagnosticFrame:request']??0;
 assert.equal(requests,result.arm==='one-frame'?1:0,'Only the frame arm may request exactly one frame');
 if(result.arm==='one-frame')assert.ok(result.frameRequestedAt>result.snapshots[0].captureCompletedAt,'Frame request must follow initial capture');
}
