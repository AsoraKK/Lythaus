import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertNoSemanticsDwell} from './frame-dwell-contract.mjs';
const fixture=(arm='wait-only')=>({arm,instrumented:true,anchorAt:100,frameRequestedAt:110,snapshots:[0,250,5250].map((time,index)=>({
 semanticsCount:0,captureStartedAt:100+time,captureCompletedAt:index===0?100:120+time,
 probe:{events:[{name:'semanticsState',detail:'disabled'}],counts:{'diagnosticFrame:request':arm==='one-frame'&&index>0?1:0}},
}))});
test('fixed dwell accepts untouched and single-frame arms',()=>{assertNoSemanticsDwell(fixture());assertNoSemanticsDwell(fixture('one-frame'));});
test('short dwell cannot establish a persistent blank sample',()=>{
 const r=fixture();r.snapshots[2].captureStartedAt=5000;assert.throws(()=>assertNoSemanticsDwell(r),/Full no-semantics dwell/);
});
test('accessibility activation invalidates a no-semantics control',()=>{
 const r=fixture();r.snapshots[1].semanticsCount=1;assert.throws(()=>assertNoSemanticsDwell(r),/Semantics must stay disabled/);
});
test('extra frame requests and requests during capture are rejected',()=>{
 const r=fixture('one-frame');r.snapshots[2].probe.counts['diagnosticFrame:request']=2;assert.throws(()=>assertNoSemanticsDwell(r));
 const early=fixture('one-frame');early.frameRequestedAt=99;assert.throws(()=>assertNoSemanticsDwell(early));
});
