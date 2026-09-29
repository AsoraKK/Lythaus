import { act, render, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { TurnstileChallenge } from './ProductionAuthAcceptance';

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
