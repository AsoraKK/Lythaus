import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/moderation/application/moderation_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';

class _MockModerationRepository extends Mock implements ModerationRepository {}

class _FakeDeviceSecurityService implements DeviceSecurityService {
  _FakeDeviceSecurityService(this.state);

  final DeviceSecurityState state;

  @override
  Future<DeviceSecurityState> evaluateSecurity() async => state;

  @override
  void clearCache() {}
}

DeviceIntegrityGuard _guardFor(DeviceSecurityState state) {
  return DeviceIntegrityGuard(
    deviceSecurityService: _FakeDeviceSecurityService(state),
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
  _MockModerationRepository repository,
  DeviceSecurityState state,
) {
  return ProviderContainer(
    overrides: [
      deviceIntegrityGuardProvider.overrideWithValue(_guardFor(state)),
      moderationRepositoryProvider.overrideWithValue(repository),
      jwtProvider.overrideWith((ref) async => 'token'),
    ],
  );
}

void main() {
  const submission = FlagSubmission(
    contentId: 'content-1',
    contentType: 'post',
    reason: 'spam',
  );

  test('blocks flagging on a compromised device', () async {
    final repository = _MockModerationRepository();
    final container = _container(
      repository,
      DeviceSecurityState(
        isRootedOrJailbroken: true,
        isEmulator: false,
        isDebugBuild: false,
        lastCheckedAt: DateTime.utc(2026),
      ),
    );
    addTearDown(container.dispose);

    await expectLater(
      container.read(flagContentProvider(submission).future),
      throwsA(
        isA<ModerationException>().having(
          (error) => error.code,
          'code',
          ErrorCodes.deviceIntegrityBlocked,
        ),
      ),
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

  test('allows flagging on a clean device', () async {
    final repository = _MockModerationRepository();
    final container = _container(
      repository,
      DeviceSecurityState(
        isRootedOrJailbroken: false,
        isEmulator: false,
        isDebugBuild: false,
        lastCheckedAt: DateTime.utc(2026),
      ),
    );
    addTearDown(container.dispose);
    when(
      () => repository.flagContent(
        contentId: 'content-1',
        contentType: 'post',
        reason: 'spam',
        additionalDetails: null,
        token: 'token',
      ),
    ).thenAnswer((_) async => {'success': true});

    final result = await container.read(flagContentProvider(submission).future);

    expect(result['success'], isTrue);
    verify(
      () => repository.flagContent(
        contentId: 'content-1',
        contentType: 'post',
        reason: 'spam',
        additionalDetails: null,
        token: 'token',
      ),
    ).called(1);
  });
}
