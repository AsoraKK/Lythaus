// Observe GL calls and the framework's first-frame notification without drawing.
export async function installPresentationProbe(context,observeGL=true){
 await context.addInitScript(observeGL=>{
  const state=window.__presentation={firstFrameAt:null,glObservation:observeGL,contexts:[],resizes:[],errors:[]};
  window.addEventListener('flutter-first-frame',()=>{state.firstFrameAt??=performance.now();});
  window.addEventListener('error',event=>state.errors.push(event.message));
  if(!observeGL)return;
  const contexts=new WeakMap();
  const canvases=new WeakMap();let nextCanvas=0;
  const canvasId=canvas=>{if(!canvases.has(canvas))canvases.set(canvas,++nextCanvas);return canvases.get(canvas);};
  for(const prototype of [window.HTMLCanvasElement?.prototype,window.OffscreenCanvas?.prototype].filter(Boolean))
   for(const property of ['width','height']){
    const descriptor=Object.getOwnPropertyDescriptor(prototype,property);
    if(!descriptor?.set||!descriptor.configurable)continue;
    Object.defineProperty(prototype,property,{...descriptor,set(value){
     if(state.resizes.length<200)state.resizes.push({canvasId:canvasId(this),property,value,at:performance.now(),connected:this.isConnected??null});
     return descriptor.set.call(this,value);
    }});
   }
  const describe=context=>({at:performance.now(),canvasId:canvasId(context.canvas),connected:context.canvas.isConnected??null,
   width:context.canvas.width,height:context.canvas.height,canvasType:context.canvas.constructor.name});
  for(const prototype of [window.WebGLRenderingContext?.prototype,window.WebGL2RenderingContext?.prototype].filter(Boolean))
   for(const method of ['clear','drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced','flush','finish','blitFramebuffer']){
    const original=Object.getOwnPropertyDescriptor(prototype,method)?.value;
    if(typeof original!=='function')continue;
    prototype[method]=function(...args){
     let record=contexts.get(this);
     if(!record){record={id:state.contexts.length+1,counts:{},first:describe(this)};contexts.set(this,record);state.contexts.push(record);}
     record.counts[method]=(record.counts[method]??0)+1;
     if(method.startsWith('draw')){record.firstDraw??=describe(this);record.lastDraw=describe(this);}
     if(method==='flush'||method==='finish')record.lastFlush=describe(this);
     return original.apply(this,args);
    };
   }
 },observeGL);
}
