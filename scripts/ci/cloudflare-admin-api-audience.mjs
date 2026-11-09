export function requireAdminApiAudienceSnapshot(application, expectedAudience) {
  if (typeof expectedAudience !== 'string' || expectedAudience.length === 0
    || expectedAudience.length > 64 || /[\u0000-\u0020\u007f]/.test(expectedAudience)) {
    throw new Error('admin_api_audience_expectation_invalid');
  }
  if (typeof application?.aud !== 'string' || application.aud !== expectedAudience) {
    throw new Error('admin_api_audience_snapshot_mismatch');
  }
  return true;
}
