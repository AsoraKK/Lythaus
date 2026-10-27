import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {containedWordmarkRect} from './brand-artwork-pixels.mjs';

const text=JSON.parse(readFileSync(new URL('../../design/tokens.json',import.meta.url))).color.dark.text;

export function brandPresentation(screen,theme){
  assert.ok(['login','onboarding','shell','admin'].includes(screen));
  assert.ok(['light','dark'].includes(theme));
  const consumer=screen!=='admin',kind=screen==='shell'?'symbol':'wordmark';
  const file=kind==='symbol'?'lythaus-symbol-square-warm.fb697a91817f.svg'
    :consumer||theme==='dark'?'lythaus-wordmark-white.5ba0451347e2.svg':'lythaus-wordmark-black.e450176663e0.svg';
  return {kind,file,foreground:consumer?text:null};
}

export function containedBrandRect(box,kind,control=false){
  assert.ok(['symbol','wordmark'].includes(kind));
  if(kind==='wordmark'){assert.equal(control,false);return containedWordmarkRect(box);}
  const size=control?24:Math.min(box.width,box.height);
  assert.ok(size<=box.width&&size<=box.height);
  return {x:box.x+(box.width-size)/2,y:box.y+(box.height-size)/2,width:size,height:size};
}

export function selectedIconAssets(screen,approved,derived){
  assert.ok(['login','onboarding','shell','admin'].includes(screen));
  if(screen==='admin')return approved.web_copy_map;
  return derived.entries.filter(entry=>entry.path.startsWith('web/icons/lythaus-four-colour/'))
    .map(entry=>({public_url:entry.path.slice(3),sha256:entry.sha256}));
}
