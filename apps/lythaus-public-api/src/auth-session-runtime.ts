export interface AuthAccount {
  status: string;
  tokenVersion: unknown;
}

export interface RefreshSessionRecord {
  sessionId: string;
  userId: string;
  familyId: string;
  status: string;
  tokenState: 'active' | 'revoked' | 'expired' | 'family_revoked';
}

interface SessionTokenDependencies {
  randomToken(bytes: number): string;
  hashRefreshToken(token: string): string;
  newId(): string;
  signAccessToken(input: { userId: string; roles: readonly string[]; tokenVersion: number }): Promise<string>;
}

export interface IssueAuthSessionDependencies extends SessionTokenDependencies {
  loadAccount(userId: string): Promise<AuthAccount | undefined>;
  createRefreshFamilyAndSession(input: {
    familyId: string;
    sessionId: string;
    userId: string;
    refreshTokenHash: string;
    refreshSessionDays: number;
  }): Promise<void>;
}

export interface RotateAuthSessionDependencies extends SessionTokenDependencies {
  findRefreshSession(refreshTokenHash: string): Promise<RefreshSessionRecord | undefined>;
  rotatePresentedSession(input: {
    sessionId: string;
    userId: string;
    familyId: string;
    replacementTokenHash: string;
    replacementSessionId: string;
    refreshSessionDays: number;
  }): Promise<boolean>;
  revokeRefreshFamily(familyId: string): Promise<void>;
  loadActiveTokenVersion(userId: string): Promise<unknown>;
}

export interface RevokeAllAuthSessionsDependencies {
  revokeAllSessions(userId: string): Promise<void>;
  revokeAllRefreshFamilies(userId: string): Promise<void>;
  bumpTokenVersion(userId: string): Promise<void>;
}

const ACCESS_TOKEN_SECONDS = 900;
const REFRESH_TOKEN_BYTES = 32;
const REFRESH_SESSION_DAYS = 30;

function requireTokenVersion(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error('account_unavailable');
  return value as number;
}

export async function issueAuthSession(
  dependencies: IssueAuthSessionDependencies,
  input: { userId: string; roles?: readonly string[] },
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const account = await dependencies.loadAccount(input.userId);
  if (!account || account.status !== 'active') throw new Error('account_unavailable');
  const tokenVersion = requireTokenVersion(account.tokenVersion);
  const accessToken = await dependencies.signAccessToken({
    userId: input.userId,
    roles: input.roles ?? [],
    tokenVersion,
  });
  const refreshToken = dependencies.randomToken(REFRESH_TOKEN_BYTES);
  await dependencies.createRefreshFamilyAndSession({
    familyId: dependencies.newId(),
    sessionId: dependencies.newId(),
    userId: input.userId,
    refreshTokenHash: dependencies.hashRefreshToken(refreshToken),
    refreshSessionDays: REFRESH_SESSION_DAYS,
  });
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_SECONDS };
}

export async function rotateAuthSession(
  dependencies: RotateAuthSessionDependencies,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const current = await dependencies.findRefreshSession(dependencies.hashRefreshToken(refreshToken));
  if (!current) throw new Error('refresh_token_invalid');
  if (current.tokenState === 'revoked') {
    await dependencies.revokeRefreshFamily(current.familyId);
    throw new Error('refresh_token_reuse');
  }
  if (current.tokenState !== 'active' || current.status !== 'active') throw new Error('refresh_token_invalid');

  const replacement = dependencies.randomToken(REFRESH_TOKEN_BYTES);
  const rotated = await dependencies.rotatePresentedSession({
    sessionId: current.sessionId,
    userId: current.userId,
    familyId: current.familyId,
    replacementTokenHash: dependencies.hashRefreshToken(replacement),
    replacementSessionId: dependencies.newId(),
    refreshSessionDays: REFRESH_SESSION_DAYS,
  });
  if (!rotated) {
    await dependencies.revokeRefreshFamily(current.familyId);
    throw new Error('refresh_token_reuse');
  }

  let tokenVersion: number;
  try {
    tokenVersion = requireTokenVersion(await dependencies.loadActiveTokenVersion(current.userId));
  } catch (error) {
    await dependencies.revokeRefreshFamily(current.familyId);
    throw error;
  }
  let accessToken: string;
  try {
    accessToken = await dependencies.signAccessToken({
      userId: current.userId,
      roles: [],
      tokenVersion,
    });
  } catch (error) {
    await dependencies.revokeRefreshFamily(current.familyId);
    throw error;
  }
  return { accessToken, refreshToken: replacement, expiresIn: ACCESS_TOKEN_SECONDS };
}

export async function revokeAllAuthSessions(dependencies: RevokeAllAuthSessionsDependencies, userId: string): Promise<void> {
  await dependencies.revokeAllSessions(userId);
  await dependencies.revokeAllRefreshFamilies(userId);
  await dependencies.bumpTokenVersion(userId);
}
