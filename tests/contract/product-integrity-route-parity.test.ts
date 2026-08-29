import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML = require('yaml');

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
type WorkerName = 'public' | 'admin';

interface RuntimeRoute {
  path: string;
  method: HttpMethod;
  worker: WorkerName;
  dispatcherNeedle: string;
}

const root = process.cwd();
const spec = JSON.parse(fs.readFileSync(path.join(root, 'api/openapi/dist/openapi.json'), 'utf8'));
const rootSpecSource = fs.readFileSync(path.join(root, 'api/openapi/openapi.yaml'), 'utf8');
const productIntegritySpec = YAML.parse(
  fs.readFileSync(path.join(root, 'api/openapi/product-integrity.yaml'), 'utf8')
);
const workers: Record<WorkerName, string> = {
  public: fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/index.ts'), 'utf8'),
  admin: fs.readFileSync(path.join(root, 'apps/lythaus-admin-api/src/index.ts'), 'utf8'),
};

const runtimeRoutes: RuntimeRoute[] = [
  { path: '/waitlist', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/waitlist'" },
  { path: '/auth/email/verify', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/auth/email/verify'" },
  { path: '/flags', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/flags'" },
  { path: '/content/flags', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/content/flags'" },
  { path: '/media/uploads', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/media/uploads'" },
  { path: '/media/uploads/{uploadSessionId}/finalise', method: 'post', worker: 'public', dispatcherNeedle: 'const finalise =' },
  { path: '/feed', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/feed'" },
  { path: '/feed/discover', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/feed/discover'" },
  { path: '/feed/news', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/feed/news'" },
  { path: '/news-board', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/news-board'" },

  { path: '/custom-feeds', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/custom-feeds'" },
  { path: '/custom-feeds', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/custom-feeds'" },
  { path: '/custom-feeds/{id}', method: 'get', worker: 'public', dispatcherNeedle: 'const customFeedRoute =' },
  { path: '/custom-feeds/{id}', method: 'put', worker: 'public', dispatcherNeedle: 'const customFeedRoute =' },
  { path: '/custom-feeds/{id}', method: 'patch', worker: 'public', dispatcherNeedle: 'const customFeedRoute =' },
  { path: '/custom-feeds/{id}', method: 'delete', worker: 'public', dispatcherNeedle: 'const customFeedRoute =' },
  { path: '/custom-feeds/{id}/items', method: 'get', worker: 'public', dispatcherNeedle: 'const customFeedItemsRoute =' },

  { path: '/posts/{postId}/comments', method: 'get', worker: 'public', dispatcherNeedle: 'const comments =' },
  { path: '/posts/{postId}/comments', method: 'post', worker: 'public', dispatcherNeedle: 'comment.create' },
  { path: '/comments/{commentId}', method: 'put', worker: 'public', dispatcherNeedle: 'const commentItem =' },
  { path: '/comments/{commentId}', method: 'patch', worker: 'public', dispatcherNeedle: 'const commentItem =' },
  { path: '/comments/{commentId}', method: 'delete', worker: 'public', dispatcherNeedle: 'comment.delete' },

  { path: '/follows', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/follows'" },
  { path: '/follows/{followedId}', method: 'delete', worker: 'public', dispatcherNeedle: 'url.pathname.match(/^\\/api\\/follows\\/' },
  { path: '/users/follow', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/users/follow'" },
  { path: '/users/{id}/follow', method: 'get', worker: 'public', dispatcherNeedle: 'const userFollow =' },
  { path: '/users/{id}/follow', method: 'post', worker: 'public', dispatcherNeedle: 'const userFollow =' },
  { path: '/users/{id}/follow', method: 'delete', worker: 'public', dispatcherNeedle: 'const userFollow =' },
  { path: '/blocks', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/blocks'" },
  { path: '/blocks', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/blocks'" },
  { path: '/users/block', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/users/block'" },
  { path: '/blocks/{id}', method: 'delete', worker: 'public', dispatcherNeedle: 'const block =' },
  { path: '/mutes', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/mutes'" },
  { path: '/mutes', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/mutes'" },
  { path: '/users/mute', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/users/mute'" },
  { path: '/mutes/{id}', method: 'delete', worker: 'public', dispatcherNeedle: 'const mute =' },
  { path: '/bookmarks', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/bookmarks'" },
  { path: '/bookmarks', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/bookmarks'" },
  { path: '/bookmarks/{postId}', method: 'delete', worker: 'public', dispatcherNeedle: 'const bookmark =' },
  { path: '/posts/{postId}/reactions', method: 'post', worker: 'public', dispatcherNeedle: 'const reaction =' },
  { path: '/posts/{postId}/reactions', method: 'put', worker: 'public', dispatcherNeedle: 'const reaction =' },
  { path: '/posts/{postId}/reactions', method: 'delete', worker: 'public', dispatcherNeedle: 'const reaction =' },

  { path: '/appeals', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/appeals'" },
  { path: '/appeals/{id}', method: 'get', worker: 'public', dispatcherNeedle: 'const appeal =' },
  { path: '/appeals/{appealId}/vote', method: 'post', worker: 'public', dispatcherNeedle: 'const appealVote =' },
  { path: '/appeals/{appealId}/recuse', method: 'post', worker: 'public', dispatcherNeedle: 'const appealRecusal =' },
  { path: '/appeals/reviewer/assignments', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/appeals/reviewer/assignments'" },

  { path: '/reputation/me', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/reputation/me'" },
  { path: '/reputation/me/ledger', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/reputation/me/ledger'" },
  { path: '/reputation/users/{id}', method: 'get', worker: 'public', dispatcherNeedle: 'const reputationUser =' },
  { path: '/reputation/user/{id}', method: 'get', worker: 'public', dispatcherNeedle: 'const reputationUser =' },
  { path: '/activity', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/activity'" },
  { path: '/users/me/activity', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/users/me/activity'" },
  { path: '/users/me', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/users/me'" },
  { path: '/users/me', method: 'put', worker: 'public', dispatcherNeedle: "url.pathname === '/api/users/me'" },
  { path: '/users/me', method: 'patch', worker: 'public', dispatcherNeedle: "url.pathname === '/api/users/me'" },

  { path: '/notifications', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/notifications'" },
  { path: '/notifications/unread-count', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/notifications/unread-count'" },
  { path: '/notifications/{id}/read', method: 'post', worker: 'public', dispatcherNeedle: 'const notificationRoute =' },
  { path: '/notifications/{id}/dismiss', method: 'post', worker: 'public', dispatcherNeedle: 'const notificationRoute =' },
  { path: '/notifications/preferences', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/notifications/preferences'" },
  { path: '/notifications/preferences', method: 'put', worker: 'public', dispatcherNeedle: "url.pathname === '/api/notifications/preferences'" },
  { path: '/notifications/preferences', method: 'patch', worker: 'public', dispatcherNeedle: "url.pathname === '/api/notifications/preferences'" },
  { path: '/notifications/devices', method: 'get', worker: 'public', dispatcherNeedle: "url.pathname === '/api/notifications/devices'" },
  { path: '/notifications/devices', method: 'post', worker: 'public', dispatcherNeedle: "url.pathname === '/api/notifications/devices'" },
  { path: '/notifications/devices/{id}/revoke', method: 'post', worker: 'public', dispatcherNeedle: 'const notificationDeviceRevoke =' },
  { path: '/privacy/requests/{requestId}/export', method: 'get', worker: 'public', dispatcherNeedle: 'const privacyExport =' },

  { path: '/admin/health', method: 'get', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/health'" },
  { path: '/admin/privacy/requests', method: 'get', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/privacy/requests'" },
  { path: '/admin/moderation/cases', method: 'get', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/moderation/cases'" },
  { path: '/admin/audit', method: 'get', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/audit'" },
  { path: '/admin/waitlist', method: 'get', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/waitlist'" },
  { path: '/admin/waitlist', method: 'post', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/waitlist'" },
  { path: '/admin/waitlist/{waitlistId}', method: 'patch', worker: 'admin', dispatcherNeedle: 'const waitlistEntry =' },
  { path: '/admin/waitlist/{waitlistId}', method: 'delete', worker: 'admin', dispatcherNeedle: 'const waitlistEntry =' },
  { path: '/admin/waitlist/{waitlistId}/status', method: 'post', worker: 'admin', dispatcherNeedle: 'const waitlistStatus =' },
  { path: '/admin/waitlist/{waitlistId}/retention-hold', method: 'post', worker: 'admin', dispatcherNeedle: 'const waitlistRetentionHold =' },
  { path: '/admin/auth/summary', method: 'get', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/auth/summary'" },
  { path: '/admin/email-health', method: 'get', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/email-health'" },
  { path: '/admin/users', method: 'get', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/users'" },
  { path: '/admin/users', method: 'post', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/users'" },
  { path: '/admin/users/{userId}', method: 'get', worker: 'admin', dispatcherNeedle: 'const adminUser =' },
  { path: '/admin/users/{userId}', method: 'patch', worker: 'admin', dispatcherNeedle: 'const adminUser =' },
  { path: '/admin/users/{userId}', method: 'delete', worker: 'admin', dispatcherNeedle: 'const deleteUser =' },
  { path: '/admin/users/{userId}/resend-verification', method: 'post', worker: 'admin', dispatcherNeedle: 'const resendVerification =' },
  { path: '/admin/users/{userId}/revoke-sessions', method: 'post', worker: 'admin', dispatcherNeedle: 'const revokeSessions =' },
  { path: '/admin/users/search', method: 'get', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/users/search'" },
  { path: '/admin/privacy/legal-holds', method: 'get', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/privacy/legal-holds'" },
  { path: '/admin/privacy/legal-holds', method: 'post', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/privacy/legal-holds'" },
  { path: '/admin/privacy/legal-holds/{holdId}/clear', method: 'post', worker: 'admin', dispatcherNeedle: 'const legalHoldClear =' },
  { path: '/admin/editorial/publications', method: 'post', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/editorial/publications'" },
  { path: '/admin/moderation/cases/{caseId}/decision', method: 'post', worker: 'admin', dispatcherNeedle: 'const moderation =' },
  { path: '/admin/appeals/{appealId}/adjudications', method: 'post', worker: 'admin', dispatcherNeedle: 'const appealAdjudication =' },
  { path: '/admin/appeals/pending-adjudication', method: 'get', worker: 'admin', dispatcherNeedle: "url.pathname === '/api/admin/appeals/pending-adjudication'" },
  { path: '/admin/reviewers/{reviewerId}/qualification', method: 'post', worker: 'admin', dispatcherNeedle: 'const reviewerQualification =' },
  { path: '/admin/reviewers/{reviewerId}/qualification', method: 'put', worker: 'admin', dispatcherNeedle: 'const reviewerQualification =' },
  { path: '/admin/users/{userId}/status', method: 'post', worker: 'admin', dispatcherNeedle: 'const accountStatus =' },
  { path: '/admin/users/{userId}/tier', method: 'post', worker: 'admin', dispatcherNeedle: 'const accountTier =' },
];

const key = (route: Pick<RuntimeRoute, 'path' | 'method'>): string => `${route.method.toUpperCase()} ${route.path}`;
const externalFragmentPaths = Array.from(
  rootSpecSource.matchAll(/^  (\/[^:]+):\r?\n    \$ref: '\.\/product-integrity\.yaml#\/paths\/([^']+)'/gm),
  (match) => ({ path: match[1], pointer: match[2].replace(/~1/g, '/').replace(/~0/g, '~') })
);

describe('product-integrity OpenAPI parity', () => {
  test('each runtime route and verb is declared by the bundled contract', () => {
    for (const route of runtimeRoutes) {
      expect(spec.paths?.[route.path]?.[route.method]).toBeDefined();
    }
  });

  test('each fragment-backed contract operation maps to a live Worker dispatcher', () => {
    const runtimeByKey = new Map(runtimeRoutes.map((route) => [key(route), route]));
    expect(externalFragmentPaths).not.toHaveLength(0);
    for (const externalPath of externalFragmentPaths) {
      expect(externalPath.pointer).toBe(externalPath.path);
      const pathItem = spec.paths?.[externalPath.path] ?? {};
      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as HttpMethod[]) {
        if (!pathItem[method]) continue;
        const route = runtimeByKey.get(`${method.toUpperCase()} ${externalPath.path}`);
        expect(route).toBeDefined();
        expect(workers[route!.worker]).toContain(route!.dispatcherNeedle);
      }
    }
  });

  test('waitlist administration declares Access, keyset pagination, retention holds, and private responses', () => {
    const list = spec.paths['/admin/waitlist'].get;
    expect(list.security).toEqual([{ cloudflareAccess: [] }]);
    expect(list.parameters.map((parameter: { name: string }) => parameter.name)).toEqual(['cursor', 'limit']);
    expect(list.responses['200'].headers['Cache-Control'].schema.enum).toEqual(['private, no-store']);
    expect(spec.components.schemas.WaitlistAdminItem.required).toContain('retentionHold');

    for (const path of [
      '/admin/waitlist/{waitlistId}/status',
      '/admin/waitlist/{waitlistId}/retention-hold',
    ]) {
      const operation = spec.paths[path].post;
      expect(operation.security).toEqual([{ cloudflareAccess: [] }]);
      expect(operation.responses['200'].headers['Cache-Control'].schema.enum).toEqual(['private, no-store']);
      expect(Object.keys(operation.responses)).toEqual(expect.arrayContaining(['400', '401', '403', '404', '413', '429', '503']));
    }

    expect(spec.paths['/admin/waitlist/{waitlistId}/status'].post.responses['409']).toBeDefined();
    expect(spec.components.schemas.WaitlistStatusUpdate.required).toEqual(['status', 'reasonCode', 'confirmation']);
    expect(spec.components.schemas.WaitlistRetentionHoldUpdate.required).toEqual(['active', 'reasonCode', 'confirmation']);
  });

  test('retired duplicate product-integrity routes are absent', () => {
    for (const retiredPath of [
      '/_admin/appeals',
      '/_admin/appeals/{appealId}',
      '/_admin/appeals/{appealId}/approve',
      '/_admin/appeals/{appealId}/reject',
      '/_admin/appeals/{appealId}/override',
      '/appeals/{id}/votes',
      '/feed/user/{userId}',
      '/feed/public',
      '/posts/{id}/bookmark',
      '/moderation/ledger/{entryId}/appeal',
      '/moderation/my-appeals',
      '/moderation/submit-appeal',
      '/moderation/vote-appeal',
      '/moderation/appeals',
      '/moderation/appeals/{appealId}/review',
      '/moderation/appeals/{appealId}/vote',
      '/reactions',
      '/reactions/{id}',
    ]) {
      expect(spec.paths?.[retiredPath]).toBeUndefined();
    }
  });

  test('comment creation exposes deterministic authorship and review lifecycle', () => {
    const create = spec.components.schemas.CommentCreateRequest;
    expect(create.required).toEqual(expect.arrayContaining(['body', 'declaredCreationMode']));
    expect(spec.components.schemas.DeclaredCreationMode.enum).toEqual(['human', 'ai_assisted']);
    expect(create['x-lythaus-ai-assisted-max-graphemes-exclusive']).toBe(250);
    expect(spec.components.schemas.Comment.properties.moderationState.$ref).toContain('ModerationState');
    expect(spec.components.schemas.ModerationState.enum).toContain('under_review');
  });

  test('canonical authorship and reputation schemas exclude retired public states', () => {
    expect(spec.components.schemas.CreatePostRequest.properties.declaredCreationMode.enum).toEqual([
      'human',
      'ai_assisted',
    ]);
    expect(spec.components.schemas.PublicAuthorship.properties.authorshipLabel.enum).toEqual([
      'Human-authored',
      'AI-assisted',
      'Under review',
    ]);
    expect(spec.components.schemas.PublicAuthorship.properties.declaredAuthorship.enum).toEqual([
      'human',
      'assisted',
    ]);
    expect(productIntegritySpec.components.schemas.ReputationPublicV2.properties.reputationBand.enum).toEqual([
      'new',
      'accountable',
      'trusted',
      'established',
    ]);
    expect(productIntegritySpec.components.schemas.ReputationPublicV2.properties.level).toMatchObject({
      minimum: 0,
      maximum: 5,
    });
  });

  test('private accountability and governance outbox contracts do not disclose sensitive fields', () => {
    const profileRequest = spec.components.schemas.ProductIntegrityProfileUpdateRequest;
    const profileUser = spec.components.schemas.ProductIntegrityPrivateProfileUser;
    const resolvedOutbox = productIntegritySpec.components.schemas.ModerationAppealResolvedOutboxPayload;
    expect(profileRequest.properties.accountabilityName).toMatchObject({ nullable: true, minLength: 2, maxLength: 160 });
    expect(profileUser.properties.accountabilityIdentityDeclared.type).toBe('boolean');
    expect(profileUser.properties.accountabilityName).toBeUndefined();
    expect(resolvedOutbox['x-lythaus-internal-event']).toBe('moderation.appeal.resolved');
    expect(resolvedOutbox.required).toEqual(expect.arrayContaining(['appealId', 'subjectUserId', 'contentId', 'finalDecision']));
    expect(spec.paths?.['/moderation.appeal.resolved']).toBeUndefined();
  });

  test('privacy export and email verification remain private non-envelope responses', () => {
    const exportDownload = spec.paths?.['/privacy/requests/{requestId}/export']?.get;
    const emailVerifyPost = spec.paths?.['/auth/email/verify']?.post;
    expect(exportDownload.responses['200'].content['application/json'].schema.$ref).toContain('PrivacyExportDocument');
    expect(exportDownload.responses['200'].headers['Cache-Control'].schema.example).toBe('private, no-store');
    expect(exportDownload.responses['404'].description).toContain('export_not_found');
    expect(exportDownload.responses['503'].description).toContain('export_unavailable');
    expect(emailVerifyPost.responses['200'].content['application/json'].schema.$ref).toContain('EmailVerificationResponse');
    expect(emailVerifyPost.responses['200'].headers['Cache-Control'].schema.example).toBe('private, no-store');
    expect(spec.components.schemas.EmailVerificationResponse.properties.state.enum).toEqual(['verified']);
  });

  test('neutral anti-abuse limits expose stable 429 contracts', () => {
    const safetyError = spec.components.schemas.SafetyLimitError;
    expect(safetyError.properties.error.enum).toEqual(expect.arrayContaining([
      'flag_daily_limit_reached',
      'media_daily_limit_reached',
      'relationship_change_limit_reached',
      'export_cooldown_active',
      'privacy_request_active',
    ]));
    const limitedOperations: Array<[string, HttpMethod, string]> = [
      ['/flags', 'post', 'flag_daily_limit_reached'],
      ['/content/flags', 'post', 'flag_daily_limit_reached'],
      ['/media/uploads', 'post', 'media_daily_limit_reached'],
      ['/follows', 'post', 'relationship_change_limit_reached'],
      ['/follows/{followedId}', 'delete', 'relationship_change_limit_reached'],
      ['/users/{id}/follow', 'post', 'relationship_change_limit_reached'],
      ['/users/{id}/follow', 'delete', 'relationship_change_limit_reached'],
      ['/privacy/requests', 'post', 'export_cooldown_active'],
    ];
    for (const [route, method, code] of limitedOperations) {
      const response = spec.paths?.[route]?.[method]?.responses?.['429'];
      expect(response.description).toContain(code);
      expect(response.content['application/json'].schema.$ref).toContain('SafetyLimitError');
    }
  });

  test('regenerated Dart client retains the product-integrity surface', () => {
    const generatedRoot = path.join(root, 'lib/generated/api_client/lib/src');
    const generated = (relativePath: string): string => fs.readFileSync(path.join(generatedRoot, relativePath), 'utf8');
    expect(generated('api/activity_api.dart')).toContain('Future<Response<ActivityPage>> activityList(');
    expect(generated('api/custom_feeds_api.dart')).toContain('Future<Response<CustomFeed>> customFeedsCreate(');
    expect(generated('api/notifications_api.dart')).toContain('Future<Response<NotificationPage>> notificationsList(');
    expect(generated('api/appeals_api.dart')).toContain('Future<Response<AppealRecusalResponse>> appealsRecuse(');
    expect(generated('api/moderation_api.dart')).toContain('Future<Response<FlagCreateResponse>> flagsCreate(');
    expect(generated('api/media_api.dart')).toContain('Future<Response<MediaUploadSessionCreated>> mediaUploadsCreate(');
    expect(generated('api/privacy_api.dart')).toContain('Future<Response<BuiltMap<String, JsonObject>>> privacyRequestExportDownload(');
    expect(generated('api/auth_api.dart')).toContain('Future<Response<EmailVerificationResponse>> authEmailVerifyPost(');
    const admin = generated('api/admin_api.dart');
    expect(admin).toContain('Future<Response<PendingAppealAdjudicationList>> adminAppealsPendingAdjudicationList(');
    expect(admin).toContain('Future<Response<ReviewerQualificationResponse>> adminReviewerQualificationUpdate(');
    expect(admin).toContain("'keyName': 'CF-Access-Jwt-Assertion'");
    const client = generated('api.dart');
    expect(client).toContain('String? basePathOverride');
    expect(client).toContain('baseUrl: basePathOverride ?? basePath');
  });
});
