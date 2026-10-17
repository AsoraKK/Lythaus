import assert from 'node:assert/strict';
export function assertStartupOrder(result){
 const before=result.snapshots.find(s=>s.phase==='before-semantics');
 const after=result.snapshots.filter(s=>s.phase==='after-semantics');
 assert.ok(before&&after.length===2,'One pre-activation and two post-activation captures required');
 const firstFrame=before.probe.events.find(e=>e.name==='frame:end');
 assert.ok(firstFrame&&firstFrame.at<=before.captureStartedAt,'First Dart frame must precede initial capture');
 assert.ok(before.captureCompletedAt>=before.captureStartedAt);
 assert.ok(result.activationAt>before.captureCompletedAt,'Semantics must activate after initial capture completes');
 assert.equal(before.probe.semantics.length,0,'Semantics must be absent before activation');
 assert.equal(before.probe.events.filter(e=>e.name==='semanticsState').at(-1)?.detail,'disabled');
 for(const snapshot of after){
  assert.ok(snapshot.captureStartedAt>=result.activationAt,'Post-activation capture order');
  assert.ok(snapshot.probe.semantics.length>0,'Activated semantics must be observable');
  assert.equal(snapshot.probe.events.filter(e=>e.name==='semanticsState').at(-1)?.detail,'enabled');
 }
}
