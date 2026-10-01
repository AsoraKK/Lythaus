export const PASSWORD_POLICY = Object.freeze({
  version: 'lythaus-password-policy-v1',
  newPasswordMin: 15,
  loginPasswordMin: 1,
  passwordMax: 128,
  lengthUnit: 'unicode-code-points',
  normalization: 'none',
});

export function requirePasswordInput(value: unknown, purpose: 'creation' | 'login'): string {
  if (typeof value !== 'string' || value.length > PASSWORD_POLICY.passwordMax * 2) {
    throw new Error('invalid_password');
  }
  const length = Array.from(value).length;
  const minimum = purpose === 'creation' ? PASSWORD_POLICY.newPasswordMin : PASSWORD_POLICY.loginPasswordMin;
  if (length < minimum || length > PASSWORD_POLICY.passwordMax) throw new Error('invalid_password');
  return value;
}
