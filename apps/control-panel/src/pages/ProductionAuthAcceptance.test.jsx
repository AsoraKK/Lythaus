import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import ProductionAuthAcceptance, { TurnstileChallenge } from './ProductionAuthAcceptance';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();delete window.turnstile;document.querySelectorAll('script[data-lythaus-turnstile]').forEach(node=>node.remove());window.history.replaceState(null,'','/');});

test('Keeper authorizes private runtime addresses without sending mail or retaining them in the page', async()=>{
  window.history.replaceState(null,'','/production-auth-acceptance?run=11111111-1111-4111-8111-111111111111');
  const run={releaseSha:'a'.repeat(40),candidate:{workerVersionId:'22222222-2222-4222-8222-222222222222'},status:'pending',expiresAt:new Date(Date.now()+60000).toISOString(),events:[],destinations:{primary:{status:'pending',reference:'primary-ref'},secondary:{status:'pending',reference:'secondary-ref'}}};
  let submitted;
  vi.stubGlobal('fetch',vi.fn(async(path,options)=>{
    if(path.endsWith('/destinations')){submitted=JSON.parse(options.body);run.destinations.primary.status='authorized';run.destinations.secondary.status='authorized';return {ok:true,json:async()=>({state:'owner_destinations_authorized'})};}
    return {ok:true,json:async()=>path.endsWith('/turnstile')?{siteKey:'synthetic-sitekey'}:run};
  }));
  const {unmount}=render(<ProductionAuthAcceptance/>);
  await screen.findByText('a'.repeat(40));
  const authorize=screen.getByRole('button',{name:'Authorize destinations for this candidate'});
  expect(authorize).toBeDisabled();
  expect(screen.getByRole('button',{name:'Request real verification email'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Primary test destination'),{target:{value:'private@example.invalid'}});
  fireEvent.change(screen.getByLabelText('Second-provider test destination'),{target:{value:'private@second.invalid'}});
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(authorize);
  await screen.findByText(/Destinations locked to this run/);
  expect(submitted).toEqual({primaryEmail:'private@example.invalid',secondaryEmail:'private@second.invalid',authorize:true,releaseSha:run.releaseSha,candidateVersion:run.candidate.workerVersionId});
  expect(document.body.textContent).not.toContain('private@example.invalid');
  expect(document.body.textContent).not.toContain('private@second.invalid');
  expect(fetch.mock.calls.filter(([path,options])=>options.method==='POST').map(([path])=>path)).toEqual([expect.stringMatching(/\/destinations$/)]);
  expect(Object.keys(localStorage)).toEqual([]);expect(Object.keys(sessionStorage)).toEqual([]);
  unmount();
});

test('Keeper recreates real widgets for each action and clears expired tokens', async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({siteKey:'synthetic-sitekey'})})));
  const onToken=vi.fn();
  window.turnstile={render:vi.fn(()=> 'widget'),remove:vi.fn()};
  const {rerender,unmount}=render(<TurnstileChallenge onToken={onToken} resetNonce={0} action="account_signup"/>);
  await waitFor(()=>expect(window.turnstile.render).toHaveBeenCalledOnce());
  let options=window.turnstile.render.mock.calls[0][1];
  expect(options.action).toBe('account_signup');
  act(()=>options.callback('synthetic-token'));
  expect(onToken).toHaveBeenLastCalledWith('synthetic-token');
  act(()=>options['expired-callback']());
  expect(onToken).toHaveBeenLastCalledWith('');
  rerender(<TurnstileChallenge onToken={onToken} resetNonce={1} action="verification_resend"/>);
  await waitFor(()=>expect(window.turnstile.render).toHaveBeenCalledTimes(2));
  expect(window.turnstile.remove).toHaveBeenCalledWith('widget');
  options=window.turnstile.render.mock.calls[1][1];
  expect(options.action).toBe('verification_resend');
  unmount();
  onToken.mockClear();
  act(()=>options.callback('late-token'));
  expect(onToken).not.toHaveBeenCalled();
});

test('Keeper waits for an existing loading script rather than remaining permanently pending',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({siteKey:'synthetic-sitekey'})})));
  const script=document.createElement('script');script.dataset.lythausTurnstile='true';document.head.appendChild(script);
  const {unmount}=render(<TurnstileChallenge onToken={vi.fn()} resetNonce={0} action="password_reset_request"/>);
  await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());
  await act(async()=>{await Promise.resolve();});
  window.turnstile={render:vi.fn(()=> 'widget'),remove:vi.fn()};
  act(()=>script.dispatchEvent(new Event('load')));
  await waitFor(()=>expect(window.turnstile.render).toHaveBeenCalledOnce());
  expect(window.turnstile.render.mock.calls[0][1].action).toBe('password_reset_request');
  unmount();
});
