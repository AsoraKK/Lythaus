import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {loginEmailReady,loginDraftAccepted} from './brand-login-draft.mjs';

function check(predicate,{input={},field={},fields}={}){
 class HTMLInputElement {}
 const active=Object.assign(new HTMLInputElement(),{
  id:'email',name:'email',isConnected:true,disabled:false,readOnly:false,value:'draft@example.invalid',
 },input);
 const email=fields??[{focused:true,readOnly:false,hasExpectedDraft:true,...field}];
 return vm.runInNewContext(`(${predicate.toString()})()`,{
  HTMLInputElement,document:{activeElement:active},
  window:{__readBrandLoginEditing:()=>JSON.stringify({email})},
 });
}

test('DOM focus alone does not establish the activated email connection',()=>{
 assert.equal(check(loginEmailReady),true);
 for(const input of [{id:''},{name:''},{id:'password'},{isConnected:false},{disabled:true},{readOnly:true}])
  assert.equal(check(loginEmailReady,{input}),false);
 for(const field of [{focused:false},{readOnly:true}])
  assert.equal(check(loginEmailReady,{field}),false);
 assert.equal(check(loginEmailReady,{fields:[]}),false);
 assert.equal(check(loginEmailReady,{fields:[{},{}]}),false);
});

test('draft acceptance requires both focused DOM and Flutter controller values',()=>{
 assert.equal(check(loginDraftAccepted),true);
 assert.equal(check(loginDraftAccepted,{input:{value:''}}),false);
 assert.equal(check(loginDraftAccepted,{field:{hasExpectedDraft:false}}),false);
 assert.equal(check(loginDraftAccepted,{field:{focused:false}}),false);
 assert.equal(check(loginDraftAccepted,{input:{id:''}}),false);
 assert.equal(check(loginDraftAccepted,{input:{disabled:true}}),false);
 assert.equal(check(loginDraftAccepted,{field:{readOnly:true}}),false);
});
