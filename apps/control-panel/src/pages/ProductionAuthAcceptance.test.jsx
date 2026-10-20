import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import ProductionAuthAcceptance, { TurnstileChallenge } from './ProductionAuthAcceptance';

afterEach(()=>{vi.restoreAllMocks();delete window.turnstile;document.querySelectorAll('script[data-lythaus-turnstile]').forEach(node=>node.remove());});

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

test('Keeper explains the real resend, immediate no-send cooldown, and post-cooldown resend sequence', async()=>{
  const runId='22222222-2222-4222-8222-222222222222';
  window.history.replaceState({},'',`/production-auth-acceptance?run=${runId}`);
  let resendCalls=0;
  const summary={
    acceptanceRunId:runId,
    releaseSha:'a'.repeat(40),
    candidate:{workerName:'lythaus-public-api-development',workerVersionId:'11111111-1111-4111-8111-111111111111'},
    events:[{type:'initial_verification_completed'},{type:'resend_fixture_created'}],
    expiredVerification:{status:'rejected'},
    resendCooldown:{status:'pending'},
  };
  vi.stubGlobal('fetch',vi.fn(async(url)=>{
    if(String(url).endsWith('/turnstile'))return {ok:true,json:async()=>({siteKey:'synthetic-sitekey'})};
    if(String(url).endsWith(`/runs/${runId}/resend`)){
      resendCalls+=1;
      return {ok:true,json:async()=>resendCalls===1
        ? {state:'resend_verification_email_requested'}
        : {state:'resend_fixture_cooldown',retryAfterSeconds:30}};
    }
    if(String(url).endsWith(`/runs/${runId}`))return {ok:true,json:async()=>summary};
    throw new Error('Unexpected mocked Keeper request');
  }));
  window.turnstile={render:vi.fn((_,options)=>{options.callback('synthetic-turnstile');return `widget-${options.action}`;}),remove:vi.fn()};
  const {unmount}=render(<ProductionAuthAcceptance/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Request resend'})).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Challenge operation'),{target:{value:'verification_resend'}});
  await waitFor(()=>expect(screen.getByText('Challenge token ready; the staged candidate verifies it with the next request.')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button',{name:'Request resend'}));
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent(/Immediately request resend once more/u));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Request resend'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Request resend'}));
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent(/Wait 30 seconds, complete a fresh challenge, then request resend again/u));
  expect(resendCalls).toBe(2);
  unmount();
});
