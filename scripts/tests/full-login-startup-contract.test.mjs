import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertStartupOrder} from './full-login-startup-contract.mjs';
const fixture=()=>({activationAt:30,snapshots:[
 {phase:'before-semantics',captureStartedAt:15,captureCompletedAt:20,probe:{semantics:[],events:[{name:'frame:end',at:10},{name:'semanticsState',detail:'disabled'}]}},
 ...[40,80].map(time=>({phase:'after-semantics',captureStartedAt:time,probe:{semantics:[{}],events:[{name:'semanticsState',detail:'enabled'}]}})),
]});
test('delayed semantics follows completed first-frame capture',()=>assertStartupOrder(fixture()));
test('first frame after capture cannot certify startup order',()=>{
 const result=fixture();result.snapshots[0].probe.events[0].at=25;
 assert.throws(()=>assertStartupOrder(result),/First Dart frame/);
});
test('activation during initial screenshot is rejected',()=>{
 const result=fixture();result.activationAt=19;
 assert.throws(()=>assertStartupOrder(result),/after initial capture/);
});
test('already-enabled semantics invalidates pre-activation capture',()=>{
 const result=fixture();result.snapshots[0].probe.events[1].detail='enabled';
 assert.throws(()=>assertStartupOrder(result));
});
