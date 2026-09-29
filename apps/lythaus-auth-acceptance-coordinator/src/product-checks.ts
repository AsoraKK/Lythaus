export const OWNER_PRODUCT_CASES = ['A03', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12', 'A13', 'A14'] as const;
type Result = { response: Response; body: Record<string, unknown> | null };
export type CandidateCall = (path: string, method: string, body?: Record<string, unknown>, headers?: Record<string, string>) => Promise<Result>;

function data(result: Result): Record<string, unknown> {
  return (result.body?.data && typeof result.body.data === 'object' ? result.body.data : result.body ?? {}) as Record<string, unknown>;
}

function expect(value: unknown, code: string): asserts value {
  if (!value) throw new Error(`acceptance_product_${code}`);
}

export async function runOwnerProductChecks({ call, login, observeTime, runId, userId, accessToken }: {
  call: CandidateCall; login: () => Promise<Result>; observeTime: () => Promise<string>; runId: string; userId: string; accessToken: string;
}) {
  const cases: { id: string; completedAt: string }[] = [];
  const passed = async (id: string) => { cases.push({ id, completedAt: await observeTime() }); };
  const headers = { authorization: `Bearer ${accessToken}`, 'idempotency-key': runId };
  expect(accessToken, 'session_missing'); await passed('A03');
  const info = await call('/api/auth/userinfo', 'GET', undefined, headers);
  expect(info.response.status === 200 && data(info).id === userId && typeof data(info).email === 'string', 'userinfo_failed');
  await passed('A05');
  const profile = await call('/api/users/me', 'GET', undefined, headers);
  expect(profile.response.status === 200, 'profile_read_failed');
  const update = await call('/api/users/me', 'PATCH', { bio: 'ADR-003 acceptance fixture' }, headers);
  expect(update.response.status === 200, 'profile_write_failed'); await passed('A11');
  const post = await call('/api/posts', 'POST', { body: 'ADR-003 acceptance fixture', declaredCreationMode: 'human', geoScope: 'none' }, headers);
  const postId = data(post).postId ?? data(post).id;
  expect(post.response.status === 201 && typeof postId === 'string', 'post_failed'); await passed('A12');
  const flag = await call('/api/flags', 'POST', { contentType: 'post', contentId: postId, reasonCode: 'acceptance_test' }, headers);
  expect(flag.response.status === 201, 'moderation_failed'); await passed('A13');
  const privacy = await call('/api/privacy/requests', 'POST', { requestType: 'export' }, headers);
  if (privacy.response.status !== 202) {
    expect(privacy.response.status === 429 && ['privacy_request_active', 'export_cooldown_active'].includes(String(data(privacy).error)), 'privacy_failed');
    const existing = await call('/api/privacy/requests?requestType=export', 'GET', undefined, headers);
    const request = data(existing).request as Record<string, unknown> | undefined;
    expect(existing.response.status === 200 && request?.requestType === 'export'
      && ['received', 'processing', 'blocked', 'completed'].includes(String(request.state)), 'privacy_status_failed');
  }
  await passed('A14');
  const session = await login();
  const refreshToken = data(session).refreshToken;
  expect(session.response.status === 200 && typeof data(session).accessToken === 'string' && typeof refreshToken === 'string', 'session_failed');
  await passed('A06');
  const refreshed = await call('/api/auth/refresh', 'POST', { refreshToken });
  expect(refreshed.response.status === 200 && typeof data(refreshed).refreshToken === 'string'
    && data(refreshed).refreshToken !== refreshToken, 'refresh_failed'); await passed('A07');
  const replay = await call('/api/auth/refresh', 'POST', { refreshToken });
  expect(replay.response.status === 401 && ['refresh_token_invalid', 'refresh_token_reuse'].includes(String(data(replay).error)), 'refresh_replay_failed');
  await passed('A08');
  const logout = await call('/api/auth/logout', 'POST', {}, headers);
  expect(logout.response.status === 200, 'logout_failed'); await passed('A09');
  const revoked = await call('/api/users/me', 'GET', undefined, headers);
  expect(revoked.response.status === 401, 'logout_revocation_failed'); await passed('A10');
  return cases;
}
