if (process.env.OWNER_TESTING_DEPLOYMENT !== 'true') throw new Error('owner_testing_mode_required');

const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const method = init.method ?? (input instanceof Request ? input.method : 'GET');
  if (method.toUpperCase() !== 'GET') throw new Error('owner_testing_prohibits_turnstile_mutation');
  return originalFetch(input, init);
};

await import('../cloudflare/waitlist-turnstile.mjs');
