import {containedWordmarkRect} from './brand-artwork-pixels.mjs';
import {regionPixels} from './full-login-pixels.mjs';

// Dark-ink row bounds from f27ce7f6 hosted WPE screenshots at 320x960.
// 1x: real-app-uninstrumented-5250.png; 2x: direct-one-frame-5250.png.
// These are diagnostic geometry references, not new acceptance thresholds.
export const headingReferences={
 1:[{top:156,bottom:194,left:88,right:231},{top:215,bottom:228,left:65,right:254}],
 2:[{top:32,bottom:71,left:88,right:231},{top:97,bottom:125,left:49,right:269},{top:151,bottom:189,left:87,right:233}],
};
export function darkInkBands(png){
 const bands=[];
 for(let y=0;y<Math.min(245,png.height);y++){
  const xs=[];
  for(let x=24;x<Math.min(296,png.width);x++){
   const i=(y*png.width+x)*4;
   if(Math.max(png.data[i],png.data[i+1],png.data[i+2])<80)xs.push(x);
  }
  if(xs.length<3)continue;
  if(!bands.length||y>bands.at(-1).bottom+1)bands.push({top:y,bottom:y,left:xs[0],right:xs.at(-1)});
  else{const b=bands.at(-1);b.bottom=y;b.left=Math.min(b.left,xs[0]);b.right=Math.max(b.right,xs.at(-1));}
 }return bands;
}
export function matchesScaleGeometry(bands,scale){
 return headingReferences[scale].every((expected,i)=>bands[i]&&Object.entries(expected).every(([key,value])=>Math.abs(bands[i][key]-value)<=1));
}
export function scalePixels(png,scale){
 const bands=darkInkBands(png),geometryMatches=matchesScaleGeometry(bands,scale);
 const artwork=bands.length?containedWordmarkRect({x:24,y:bands[0].top,width:272,height:40}):null;
 const formRect=scale===1?{x:24,y:300,width:272,height:520}:{x:24,y:390,width:272,height:510};
 return {surface:regionPixels(png,{x:0,y:0,width:320,height:900}),form:regionPixels(png,formRect),
  brand:artwork?regionPixels(png,artwork):null,artwork,bands,geometryMatches};
}
