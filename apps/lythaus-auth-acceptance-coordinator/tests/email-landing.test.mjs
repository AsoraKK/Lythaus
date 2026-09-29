import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptanceEmailLanding, requireEmailCompletionOrigin } from '../src/email-landing.ts';

test('acceptance email GET is a scanner-safe secret-free interstitial with strict headers', async () => {
  const response=acceptanceEmailLanding();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'; script-src 'nonce-[^']+'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'/);
  const html=await response.text();
  assert.match(html,/hash \? new URLSearchParams/);
  assert.match(html,/history.replaceState/);
  assert.match(html,/<form method="post" action="\/api\/admin\/production-auth-acceptance\/email\/complete"/);
  assert.doesNotMatch(html,/localStorage|sessionStorage|form.submit\(|<script src|<img/);
  assert.ok(html.indexOf("form.addEventListener('submit'")<html.indexOf('await fetch('));
  assert.match(html,/AbortSignal.timeout\(20000\)/);
  assert.match(html,/if\(busy\)return/);
  assert.match(html,/finally\{busy=false;form.querySelector\('button'\).disabled=false/);
  assert.match(html,/password!==form.elements.passwordConfirmation.value/);
  assert.match(html,/Only continue if you requested this email/);
});
test('acceptance completion rejects missing, malicious sibling, null and cross-site origins', () => {
  const url='https://admin.lythaus.co/api/admin/production-auth-acceptance/email/complete';
  for(const origin of ['', 'null','https://app.lythaus.co','https://admin.lythaus.co.attacker.invalid','http://admin.lythaus.co']) {
    assert.throws(()=>requireEmailCompletionOrigin(new Request(url,{method:'POST',headers:origin?{origin}:{}})),/acceptance_origin_invalid/);
  }
  assert.doesNotThrow(()=>requireEmailCompletionOrigin(new Request(url,{method:'POST',headers:{origin:'https://admin.lythaus.co'}})));
});
