import assert from 'node:assert/strict';

// Compare only the artwork rectangle. A one-pixel edge allowance accommodates
// rasterizer antialiasing; it does not excuse missing or unrelated artwork.
export function artworkFidelity(actual, reference, background) {
  assert.equal(actual.width, reference.width);
  assert.equal(actual.height, reference.height);
  const {width,height}=actual;
  const mask = png => Array.from({length:width*height}, (_,i) =>
    [0,1,2].some(c => Math.abs(png.data[i*4+c]-background[c]) > 40));
  const a=mask(actual), b=mask(reference);
  const count=values=>values.filter(Boolean).length;
  const matches=(from,to)=>from.reduce((sum,on,i)=> {
    if (!on) return sum;
    const x=i%width,y=Math.floor(i/width);
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++)
      if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height&&to[(y+dy)*width+x+dx])return sum+1;
    return sum;
  },0);
  const ink=count(a), expected=count(b);
  const precision=matches(a,b)/Math.max(1,ink), recall=matches(b,a)/Math.max(1,expected);
  let difference=0;
  for(let i=0;i<width*height;i++)for(let c=0;c<3;c++)difference+=Math.abs(actual.data[i*4+c]-reference.data[i*4+c]);
  const normalizedDifference=difference/(width*height*3*255);
  assert.ok(expected>=16, 'Reference artwork is nonblank');
  assert.ok(ink>=16 && precision>=0.9 && recall>=0.9 && normalizedDifference<0.04,
    `Artwork fidelity: ink=${ink}, precision=${precision}, recall=${recall}, difference=${normalizedDifference}`);
  return {ink,expected,precision,recall,normalizedDifference};
}
