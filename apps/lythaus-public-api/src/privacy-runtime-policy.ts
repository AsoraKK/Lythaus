export type PrivacyRequestType = 'export' | 'delete' | 'rectify';

export interface PrivacyRequestPlan {
  requestType: PrivacyRequestType;
  requiresExportCooldown: boolean;
  activityEvent: 'privacy.export_requested' | 'privacy.deletion_requested' | 'privacy.rectification_requested';
  activityTitle: string;
}

export interface RetentionRulePlan {
  contentType: 'post' | 'media';
  retentionDays: number;
}

export function privacyRequestPlan(value: unknown): PrivacyRequestPlan {
  if (value === 'export') {
    return {
      requestType: value,
      requiresExportCooldown: true,
      activityEvent: 'privacy.export_requested',
      activityTitle: 'You requested a data export',
    };
  }
  if (value === 'delete') {
    return {
      requestType: value,
      requiresExportCooldown: false,
      activityEvent: 'privacy.deletion_requested',
      activityTitle: 'You requested account deletion',
    };
  }
  if (value === 'rectify') {
    return {
      requestType: value,
      requiresExportCooldown: false,
      activityEvent: 'privacy.rectification_requested',
      activityTitle: 'You requested data rectification',
    };
  }
  throw new Error('invalid_privacy_request');
}

export function optionalPrivacyRequestType(value: unknown): PrivacyRequestType | undefined {
  return value === null || value === undefined ? undefined : privacyRequestPlan(value).requestType;
}

export function retentionRulePlan(input: { contentType?: unknown; retentionDays?: unknown }): RetentionRulePlan {
  const contentType = input.contentType === 'posts' ? 'post' : input.contentType;
  if (contentType !== 'post' && contentType !== 'media') throw new Error('invalid_retention_content_type');
  if (!Number.isInteger(input.retentionDays) || (input.retentionDays as number) < 30 || (input.retentionDays as number) > 3650) {
    throw new Error('invalid_retention_period');
  }
  return { contentType, retentionDays: input.retentionDays as number };
}

export function requirePrivacyExportDependencies<TManifest, TStorage>(input: {
  manifest: TManifest | undefined;
  storage: TStorage | undefined;
}): { manifest: TManifest; storage: TStorage } {
  if (!input.manifest) throw new Error('export_not_found');
  if (!input.storage) throw new Error('export_not_configured');
  return { manifest: input.manifest, storage: input.storage };
}

export function requirePrivacyExportObject<TObject>(object: TObject | null | undefined): TObject {
  if (!object) throw new Error('export_unavailable');
  return object;
}

export function privacyExportAccessActivity(requestId: string): {
  eventType: 'privacy.export_accessed';
  title: string;
  objectType: 'privacy_request';
  objectId: string;
  requestType: 'export';
  requestState: 'completed';
} {
  return {
    eventType: 'privacy.export_accessed',
    title: 'You accessed your data export',
    objectType: 'privacy_request',
    objectId: requestId,
    requestType: 'export',
    requestState: 'completed',
  };
}
