export function loginEmailReady(){
 const input=document.activeElement;
 if(!(input instanceof HTMLInputElement)||input.id!=='email'||input.name!=='email'||
  !input.isConnected||input.disabled||input.readOnly)return false;
 const fields=JSON.parse(window.__readBrandLoginEditing()).email;
 return fields.length===1&&fields[0].focused&&!fields[0].readOnly;
}

export function loginDraftAccepted(){
 const input=document.activeElement;
 if(!(input instanceof HTMLInputElement)||input.id!=='email'||input.name!=='email'||
  !input.isConnected||input.disabled||input.readOnly||input.value!=='draft@example.invalid')return false;
 const fields=JSON.parse(window.__readBrandLoginEditing()).email;
 return fields.length===1&&fields[0].focused&&!fields[0].readOnly&&fields[0].hasExpectedDraft;
}

export async function installLoginDraftTrace(context){
 await context.addInitScript(()=>{
  const nodes=new WeakMap();let nextNode=0;
  const describe=node=>{
   if(!(node instanceof Element))return null;
   if(!nodes.has(node))nodes.set(node,++nextNode);
   const input=node instanceof HTMLInputElement||node instanceof HTMLTextAreaElement?node:null;
   return {nodeId:nodes.get(node),tag:node.tagName,id:node.id,name:input?.name??null,classes:node.className,role:node.getAttribute('role'),
    type:input?.type??null,connected:node.isConnected,focused:node===document.activeElement,
    disabled:input?.disabled??null,readOnly:input?.readOnly??null,
    valueLength:input?.value.length??null,hasExpectedDraft:input?.value==='draft@example.invalid'};
  };
  window.__brandLoginDraftTrace=[];
  window.__captureBrandLoginDraft=(boundary,event)=>{
   let controller=null;
   try{if(typeof window.__readBrandLoginEditing==='function')controller=JSON.parse(window.__readBrandLoginEditing());}
   catch(error){controller={observationError:String(error)};}
   const entry={boundary,at:performance.now(),viewport:{width:innerWidth,height:innerHeight},
    active:describe(document.activeElement),target:describe(event?.target),
    inputType:event?.inputType??null,dataLength:typeof event?.data==='string'?event.data.length:null,controller};
   if(window.__brandLoginDraftTrace.length<160)window.__brandLoginDraftTrace.push(entry);
   return entry;
  };
  for(const type of ['focusin','focusout','beforeinput','input','change','resize'])
   window.addEventListener(type,event=>window.__captureBrandLoginDraft(type+':capture',event),true);
  window.addEventListener('input',event=>window.__captureBrandLoginDraft('input:bubble',event));
 });
}

export async function captureLoginDraftTrace(page,boundary){
 return page.evaluate(boundary=>{
  window.__captureBrandLoginDraft(boundary);
  return window.__brandLoginDraftTrace;
 },boundary);
}
