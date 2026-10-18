import assert from 'node:assert/strict';
export function regionPixels(png,rect){
 assert.ok(rect&&rect.width>0&&rect.height>0,'Region must have positive bounds');
 const colors=new Map();let pixels=0,gray=0,lightGray=0,white=0;
 for(let y=Math.max(0,Math.ceil(rect.y));y<Math.min(png.height,rect.y+rect.height);y++)
  for(let x=Math.max(0,Math.ceil(rect.x));x<Math.min(png.width,rect.x+rect.width);x++){
   const i=(y*png.width+x)*4,color=png.data.readUInt32BE(i);
   colors.set(color,(colors.get(color)??0)+1);pixels++;
   if(png.data[i]===128&&png.data[i+1]===128&&png.data[i+2]===128)gray++;
   if(png.data[i]===192&&png.data[i+1]===192&&png.data[i+2]===192)lightGray++;
   if(png.data[i]===255&&png.data[i+1]===255&&png.data[i+2]===255)white++;
  }
 const painted=pixels-Math.max(0,...colors.values());
 return {pixels,colors:colors.size,painted,nonblank:colors.size>=4&&painted>=16&&painted/pixels>0.003,
  neutralFill:pixels>0&&gray/pixels>=0.4&&lightGray/pixels>=0.4,gray,lightGray,white};
}
