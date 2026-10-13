export function privacyPostgresTarget(value) {
  let target;
  try { target = new URL(value); }
  catch { throw new Error('privacy_fixture_target_invalid'); }
  const localDatabase = /^\/lythaus_auth_test[a-z0-9_]*$/.test(target.pathname)
    || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres');
  const parameters = [...target.searchParams];
  if (target.protocol !== 'postgresql:' || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || !localDatabase || target.hash !== '' || parameters.length > 1
    || parameters.some(([key, value]) => key !== 'sslmode' || value !== 'disable')) {
    throw new Error('privacy_fixture_target_invalid');
  }
  return target;
}
