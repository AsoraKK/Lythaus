import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { accessSubject } from '../src/access-policy.ts';

const {privateKey,publicKey}=await generateKeyPair('RS256');
const jwk={...await exportJWK(publicKey),kid:'local-fixture',alg:'RS256'};
const server=createServer((_request,response)=>{response.setHeader('content-type','application/json');response.end(JSON.stringify({keys:[jwk]}));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
after(()=>new Promise(resolve=>server.close(resolve)));
const env={ACCESS_JWKS_URL:`http://127.0.0.1:${server.address().port}/certs`,ACCESS_AUDIENCES:'admin-ui-fixture',ACCESS_TEAM_DOMAIN:'local-fixture.cloudflareaccess.com'};
const sign=(claims={})=>new SignJWT({sub:'local-human',email:'synthetic@example.invalid',type:'app',...claims})
  .setProtectedHeader({alg:'RS256',kid:'local-fixture'}).setAudience('admin-ui-fixture').setIssuer(`https://${env.ACCESS_TEAM_DOMAIN}`).setIssuedAt().setExpirationTime('5m').sign(privateKey);
const request=token=>new Request('https://admin.lythaus.co/',{headers:{'cf-access-jwt-assertion':token}});
test('Keeper accepts only an actually signed human app identity for its configured issuer and audience',async()=>{
  const token=await sign();assert.equal(await accessSubject(request(token),env),'local-human');
  for(const claims of [{sub:''},{sub:undefined},{common_name:'fixture.access'},{type:'org'},{email:undefined},{email:'invalid'}]){
    const awaitedToken=await sign(claims);
    await assert.rejects(()=>accessSubject(request(awaitedToken),env),/access_subject_missing/);
  }
  for(const config of [{...env,ACCESS_AUDIENCES:'different'},{...env,ACCESS_TEAM_DOMAIN:'wrong.cloudflareaccess.com'}])await assert.rejects(()=>accessSubject(request(token),config),/access_assertion_invalid/);
  for(const config of [{...env,ACCESS_JWKS_URL:''},{...env,ACCESS_AUDIENCES:''},{...env,ACCESS_TEAM_DOMAIN:''}])await assert.rejects(()=>accessSubject(request(token),config),/access_required/);
  await assert.rejects(()=>accessSubject(new Request('https://admin.lythaus.co/'),env),/access_required/);
  await assert.rejects(()=>accessSubject(request('malformed'),env),/access_assertion_invalid/);
});
