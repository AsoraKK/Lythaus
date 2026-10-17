import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareBrandLoginSource,geometryImport,geometryInstall} from './brand-login-source.mjs';
import {originalRunApp,wrappedRunApp} from './full-login-scale-source.mjs';
import {loginFixtureResponse,expectedRefreshConsole,refreshUrl,logoutUrl,discoverUrl} from './brand-login-transport.mjs';
import {assertBrandCaseMatrix,brandCaseKeys} from './brand-case-matrix.mjs';
import {assertLoginLayout,assertMatchingLoginLayout,loginFirstPaintPixels,assertLoginFirstPaintPixels} from './brand-login-first-paint.mjs';
test('login fixture preserves production outside scale and read-only layout setup',async()=>{
 const source=await readFile('lib/main.dart','utf8');
 const prepared=prepareBrandLoginSource(source);
 assert.equal(prepared.replace('\n'+geometryImport,'').replace(geometryInstall,'').replace(wrappedRunApp,originalRunApp),source);
 const geometry=await readFile('test/browser/brand_login_geometry.dart','utf8');
 assert.doesNotMatch(geometry,/scheduleFrame|addPostFrameCallback|ensureSemantics|markNeedsPaint|setState/);
 assert.match(geometry,/localToGlobal/);assert.match(geometry,/render\.size\.height/);
});
test('only exact auth and public empty Discover requests are fulfilled',()=>{
 assert.equal(loginFixtureResponse(refreshUrl,'POST').status,401);
 assert.equal(loginFixtureResponse(logoutUrl,'POST').status,200);
 assert.deepEqual(loginFixtureResponse(discoverUrl,'GET').body,{items:[],hasMore:false,nextCursor:null});
 for(const [url,method] of [[refreshUrl,'POST'],[logoutUrl,'POST'],[discoverUrl,'GET']]){
  assert.equal(loginFixtureResponse(url,'OPTIONS',method).status,200);
  assert.equal(loginFixtureResponse(url,'OPTIONS','DELETE'),null);
 }
 for(const [url,method] of [[logoutUrl,'GET'],[discoverUrl,'POST'],[discoverUrl+'&tag=x','GET'],[discoverUrl.replace('limit=25','limit=50'),'GET'],[refreshUrl+'?x=1','POST'],[logoutUrl.replace('api.lythaus.co','api.lythaus.co.invalid'),'POST'],['https://api.lythaus.co/api/users/me','GET']])assert.equal(loginFixtureResponse(url,method),null);
});
test('401 error allowance requires exact resource identity and a fulfilled request',()=>{
 const error={url:refreshUrl,text:'Failed to load resource: the server responded with a status of 401 (Unauthorized)'};
 const requests=[{url:refreshUrl,method:'POST',status:401}];
 assert.ok(expectedRefreshConsole(error,requests));
 assert.ok(!expectedRefreshConsole(error,[]));
 assert.ok(!expectedRefreshConsole({...error,url:logoutUrl},requests));
 assert.ok(!expectedRefreshConsole({...error,text:'Application error 401'},requests));
});
test('full matrix rejects skipped or duplicate cases independently of outcome',()=>{
 const results=brandCaseKeys.map(key=>{const [screen,theme,width]=key.split('-');return {screen,theme,width:Number(width),status:'failed'};});
 assertBrandCaseMatrix(results);
 assert.throws(()=>assertBrandCaseMatrix(results.slice(1)),/Every required/);
 assert.throws(()=>assertBrandCaseMatrix([...results.slice(1),results[1]]),/unique/);
 for(const screen of ['login','onboarding','shell','admin'])assert.equal(results.filter(r=>r.screen===screen).length,6);
});
function paintFixture(){
 const png={width:320,height:960,data:Buffer.alloc(320*960*4,255)};
 const layout={brands:[{x:24.25,y:32.5,width:271.5,height:40}],fields:{Email:[{x:24,y:200,width:272,height:64}],Password:[{x:24,y:276,width:272,height:64}]},scales:[2],semanticsEnabled:false};
 const measured=loginFirstPaintPixels(png,layout);
 for(const rect of Object.values(measured.rectangles))for(let y=Math.ceil(rect.y);y<rect.y+rect.height;y++)for(let x=Math.ceil(rect.x);x<rect.x+rect.width;x++){
  const i=(y*png.width+x)*4;png.data[i]=(x+y)%4*60;png.data[i+1]=png.data[i];png.data[i+2]=png.data[i];
 }
 return {png,layout};
}
test('first-paint validation retains fractional contained geometry and rejects changed layout',()=>{
 const {png,layout}=paintFixture();assertLoginLayout(layout,2);
 const measured=loginFirstPaintPixels(png,layout);assertLoginFirstPaintPixels(measured);
 assert.equal(measured.artwork.y,32.5);assert.notEqual(measured.artwork.x,Math.floor(measured.artwork.x));
 assertMatchingLoginLayout(layout,structuredClone(layout));
 const changed=structuredClone(layout);changed.fields.Email[0].y+=1;
 assert.throws(()=>assertMatchingLoginLayout(layout,changed),/Email.y/);
 assert.throws(()=>assertLoginLayout({...layout,semanticsEnabled:true},2),/precedes/);
 assert.throws(()=>assertLoginLayout(layout,1),/scale/);
});
test('a brand alone cannot certify first-paint form pixels; saved blanks remain failures',()=>{
 const {png,layout}=paintFixture();
 const savedBlank={...png,data:Buffer.alloc(png.data.length,255)};
 assert.throws(()=>assertLoginFirstPaintPixels(loginFirstPaintPixels(savedBlank,layout)),/brand did not paint/);
 for(const rect of Object.values(layout.fields).flat())for(let y=rect.y;y<rect.y+rect.height;y++)png.data.fill(255,(y*png.width+rect.x)*4,(y*png.width+rect.x+rect.width)*4);
 assert.throws(()=>assertLoginFirstPaintPixels(loginFirstPaintPixels(png,layout)),/email did not paint/);
 const outside=structuredClone(layout);outside.fields.Password[0].y=950;
 assert.throws(()=>loginFirstPaintPixels(png,outside),/inside the saved PNG/);
});
