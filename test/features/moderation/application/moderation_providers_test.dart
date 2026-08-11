import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/moderation/application/moderation_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';

class _MockModerationRepository extends Mock implements ModerationRepository {}

class _CleanDeviceSecurityService implements DeviceSecurityService {
  @override
  Future<DeviceSecurityState> evaluateSecurity() async => DeviceSecurityState(
    isRootedOrJailbroken: false,
    isEmulator: false,
    isDebugBuild: false,
    lastCheckedAt: DateTime.utc(2026),
  );

  @override
  void clearCache() {}
}

DeviceIntegrityGuard _allowingGuard() {
  return DeviceIntegrityGuard(
    deviceSecurityService: _CleanDeviceSecurityService(),
    config: const MobileSecurityConfig(
      tlsPins: TlsPinConfig(
        enabled: false,
        strictMode: false,
        spkiPinsBase64: [],
      ),
      strictDeviceIntegrity: true,
      blockRootedDevices: true,
      allowRootedInPreviewForQa: false,
    ),
    environment: Environment.production,
  );
}

ProviderContainer _container(
  _MockModerationRepository repository, {
  String? token = 'mock-jwt-token',
}) {
  return ProviderContainer(
    overrides: [
      moderationRepositoryProvider.overrideWithValue(repository),
      deviceIntegrityGuardProvider.overrideWithValue(_allowingGuard()),
      jwtProvider.overrideWith((ref) => Future.value(token)),
    ],
  );
}

void main() {
  test('moderationClientProvider exposes the shared repository', () {
    final repository = _MockModerationRepository();
    final container = _container(repository);
    addTearDown(container.dispose);

    expect(container.read(moderationClientProvider), same(repository));
  });

  test('flagContentProvider forwards a supported flag request', () async {
    final repository = _MockModerationRepository();
    final container = _container(repository);
    addTearDown(container.dispose);
    const submission = FlagSubmission(
      contentId: 'content-123',
      contentType: 'post',
      reason: 'spam',
      additionalDetails: 'Repeated promotional links',
    );
    const expected = {'success': true, 'flagId': 'flag-123'};

    when(
      () => repository.flagContent(
        contentId: submission.contentId,
        contentType: submission.contentType,
        reason: submission.reason,
        additionalDetails: submission.additionalDetails,
        token: 'mock-jwt-token',
      ),
    ).thenAnswer((_) async => expected);

    final result = await container.read(flagContentProvider(submission).future);

    expect(result, expected);
    verify(
      () => repository.flagContent(
        contentId: submission.contentId,
        contentType: submission.contentType,
        reason: submission.reason,
        additionalDetails: submission.additionalDetails,
        token: 'mock-jwt-token',
      ),
    ).called(1);
  });

  test('flagContentProvider rejects an unauthenticated request', () async {
    final repository = _MockModerationRepository();
    final container = _container(repository, token: null);
    addTearDown(container.dispose);

    await expectLater(
      container.read(
        flagContentProvider(
          const FlagSubmission(
            contentId: 'content-123',
            contentType: 'post',
            reason: 'spam',
          ),
        ).future,
      ),
      throwsA(isA<ModerationException>()),
    );
    verifyNever(
      () => repository.flagContent(
        contentId: any(named: 'contentId'),
        contentType: any(named: 'contentType'),
        reason: any(named: 'reason'),
        additionalDetails: any(named: 'additionalDetails'),
        token: any(named: 'token'),
      ),
    );
  });

  test('FlagSubmission preserves optional details', () {
    const submission = FlagSubmission(
      contentId: 'content-123',
      contentType: 'post',
      reason: 'inappropriate',
      additionalDetails: 'Context for the moderation team',
    );

    expect(submission.contentId, 'content-123');
    expect(submission.contentType, 'post');
    expect(submission.reason, 'inappropriate');
    expect(submission.additionalDetails, 'Context for the moderation team');
  });
}
