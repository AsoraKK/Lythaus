const baseUrl = process.env.PRODUCTION_JOBS_API_BASE_URL?.trim();
const token = process.env.DATABASE_READINESS_TOKEN?.trim();
if (!baseUrl || !token) throw new Error('PRODUCTION_JOBS_API_BASE_URL and DATABASE_READINESS_TOKEN are required');

const response = await fetch(`${baseUrl.replace(/\/$/, '')}/internal/readiness/budget-hard-stop`, {
  headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  signal: AbortSignal.timeout(15_000),
});
const body = await response.json().catch(() => null);
if (!response.ok || !body || body.simulation !== 'budget_hard_stop' || body.reservationStatus !== 'rejected' || body.providerCallPermitted !== false || body.ledgerAvailable !== true || body.readiness !== 'pass') {
  throw new Error(`deployed budget hard-stop simulation failed with HTTP ${response.status}`);
}
console.log(JSON.stringify({ status: 'pass', simulation: body.simulation, reservationStatus: body.reservationStatus, providerCallPermitted: body.providerCallPermitted, ledgerAvailable: body.ledgerAvailable, readiness: body.readiness }));
