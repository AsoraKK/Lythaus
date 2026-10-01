export function acceptanceEmailLanding(): Response {
  const nonce = crypto.randomUUID();
  const script = `const form=document.querySelector('form');
const locationUrl=new URL(window.location.href);
const parameters=locationUrl.hash ? new URLSearchParams(locationUrl.hash.slice(1)) : locationUrl.searchParams;
window.history.replaceState(null,'',locationUrl.pathname);
const context=parameters.get('context')||'';
const token=parameters.get('token')||'';
const purpose=parameters.get('purpose')||'';
if(!/^[a-f0-9]{64}$/.test(context)||!/^[a-f0-9]{64}$/.test(token)||!['verification','password_reset'].includes(purpose)){
document.querySelector('[role=status]').textContent='This link is incomplete. Return to the Keeper screen for a current email.';
form.hidden=true;
}else{
form.elements.context.value=context;form.elements.token.value=token;form.elements.purpose.value=purpose;
document.querySelector('h1').textContent=purpose==='password_reset'?'Choose a new password':'Verify your email and finish setup';
let busy=false;
form.addEventListener('submit',async event=>{
event.preventDefault();if(busy)return;
const password=form.elements.password.value;
if(Array.from(password).length<15||Array.from(password).length>128||password!==form.elements.passwordConfirmation.value){
document.querySelector('[role=status]').textContent='Use 15–128 characters and enter the same password twice.';return;
}
busy=true;form.querySelector('button').disabled=true;
document.querySelector('[role=status]').textContent='Confirming securely…';
try{
const response=await fetch(form.action,{method:'POST',body:new FormData(form),credentials:'same-origin',signal:AbortSignal.timeout(20000)});
if(response.ok){form.reset();form.hidden=true;document.querySelector('[role=status]').textContent='Completed. Return to the Keeper acceptance screen.';}
else{document.querySelector('[role=status]').textContent=response.status===429?'Please wait before trying again.':'Confirmation could not be completed. Check your password, or return to Keeper to check whether the link is still current.';}
}catch{document.querySelector('[role=status]').textContent='The result is not confirmed. Check the Keeper screen before trying again.';}
finally{busy=false;form.querySelector('button').disabled=false;}
});
}`;
  return new Response(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>Lythaus secure confirmation</title></head><body><main><h1>Lythaus secure confirmation</h1><p>Opening this page does not verify or reset anything. Only continue if you requested this email.</p><p role="status" aria-live="polite"></p><form method="post" action="/api/admin/production-auth-acceptance/email/complete"><input type="hidden" name="context"><input type="hidden" name="purpose"><input type="hidden" name="token"><p>Choose 15–128 characters. You may use the password you chose on the Keeper screen. Only the mailbox owner completes setup here.</p><p><label>Password <input name="password" type="password" autocomplete="new-password" maxlength="256" required></label></p><p><label>Confirm password <input name="passwordConfirmation" type="password" autocomplete="new-password" maxlength="256" required></label></p><button type="submit">Confirm securely</button></form><noscript>Enable JavaScript to complete this secure handoff. Opening this email has not changed your account.</noscript></main><script nonce="${nonce}">${script}</script></body></html>`, {
    headers: {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff',
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; connect-src 'self'`,
    },
  });
}

export function requireEmailCompletionOrigin(request: Request): void {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new Error('acceptance_origin_invalid');
}
