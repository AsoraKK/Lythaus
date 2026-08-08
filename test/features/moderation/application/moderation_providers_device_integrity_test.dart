import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/moderation/application/moderation_providers.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/moderation/domain/moderation_case.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';
import 'package:lythaus/core/providers/repository_providers.dart';

class _FakeDeviceSecurityService implements DeviceSecurityService {
  _FakeDeviceSecurityService(this._state);

  final DeviceSecurityState _state;

  @override
  Future<DeviceSecurityState> evaluateSecurity() async => _state;

  @override
  void clearCache() {}
}

class _FakeModerationRepository implements ModerationRepository {
  bool submitAppealCalled = false;
  bool flagContentCalled = false;
  bool submitVoteCalled = false;

  @override
  Future<Appeal> submitAppeal({
    required String contentId,
    required String contentType,
    required String appealType,
    required String appealReason,
    required String userStatement,
    required String token,
  }) async {
    submitAppealCalled = true;
    return _fakeAppeal();
  }

  @override
  Future<Map<String, dynamic>> flagContent({
    required String contentId,
    required String contentType,
    required String reason,
    String? additionalDetails,
    required String token,
  }) async {
    flagContentCalled = true;
    return {'success': true};
  }

  @override
  Future<VoteResult> submitVote({
    required String appealId,
    required String vote,
    String? comment,
    required String token,
  }) async {
    submitVoteCalled = true;
    return const VoteResult(success: true, tallyTriggered: false);
  }

  @override
  Future<List<Appeal>> getMyAppeals({required String token}) {
    throw UnimplementedError();
  }

  @override
  Future<AppealResponse> getVotingFeed({
    int page = 1,
    int pageSize = 20,
    AppealFilters? filters,
    required String token,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<ModerationQueueResponse> fetchModerationQueue({
    int page = 1,
    int pageSize = 20,
    ModerationFilters? filters,
    required String token,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<ModerationCase> fetchModerationCase({
    required String caseId,
    required String token,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<ModerationDecisionResult> submitModerationDecision({
    required String caseId,
    required String token,
    required ModerationDecisionInput input,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<void> escalateModerationCase({
    required String caseId,
    required String token,
    required ModerationEscalationInput input,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<ModerationAuditResponse> fetchCaseAudit({
    required String caseId,
    required String token,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<ModerationAuditResponse> searchAudit({
    required ModerationAuditSearchFilters filters,
    required String token,
  }) {
    throw UnimplementedError();
  }
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

Appeal _fakeAppeal() {
  return Appeal(
    appealId: 'appeal-1',
    contentId: 'content-1',
    contentType: 'post',
    contentPreview: 'preview',
    appealType: 'false_positive',
    appealReason: 'context_missing',
    userStatement: 'statement',
    submitterId: 'user-1',
    submitterName: 'User',
    submittedAt: DateTime(2025, 1, 1),
    expiresAt: DateTime(2025, 1, 2),
    flagReason: 'spam',
    flagCategories: const ['spam'],
    flagCount: 1,
    votingStatus: VotingStatus.active,
    urgencyScore: 10,
    estimatedResolution: 'soon',
    hasUserVoted: false,
    canUserVote: true,
  );
}

void main() {
  test('blocks appeal submission on compromised devices', () async {
    final compromised = DeviceSecurityState(
      isRootedOrJailbroken: true,
      isEmulator: false,
      isDebugBuild: false,
      lastCheckedAt: DateTime.now(),
    );

    final repo = _FakeModerationRepository();
    final container = ProviderContainer(
      overrides: [
        deviceIntegrityGuardProvider.overrideWithValue(_guardFor(compromised)),
        moderationRepositoryProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    await expectLater(
      container.read(
        submitAppealProvider(
          const AppealSubmission(
            contentId: 'content-1',
            contentType: 'post',
            appealType: 'false_positive',
            appealReason: 'context_missing',
            userStatement: 'statement',
          ),
        ).future,
      ),
      throwsA(
        isA<ModerationException>().having(
          (error) => error.code,
          'code',
          ErrorCodes.deviceIntegrityBlocked,
        ),
      ),
    );

    expect(repo.submitAppealCalled, isFalse);
  });

  test('blocks flagging on compromised devices', () async {
    final compromised = DeviceSecurityState(
      isRootedOrJailbroken: true,
      isEmulator: false,
      isDebugBuild: false,
      lastCheckedAt: DateTime.now(),
    );

    final repo = _FakeModerationRepository();
    final container = ProviderContainer(
      overrides: [
        deviceIntegrityGuardProvider.overrideWithValue(_guardFor(compromised)),
        moderationRepositoryProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    await expectLater(
      container.read(
        flagContentProvider(
          const FlagSubmission(
            contentId: 'content-1',
            contentType: 'post',
            reason: 'spam',
          ),
        ).future,
      ),
      throwsA(
        isA<ModerationException>().having(
          (error) => error.code,
          'code',
          ErrorCodes.deviceIntegrityBlocked,
        ),
      ),
    );

    expect(repo.flagContentCalled, isFalse);
  });

  test('blocks voting on compromised devices', () async {
    final compromised = DeviceSecurityState(
      isRootedOrJailbroken: true,
      isEmulator: false,
      isDebugBuild: false,
      lastCheckedAt: DateTime.now(),
    );

    final repo = _FakeModerationRepository();
    final container = ProviderContainer(
      overrides: [
        deviceIntegrityGuardProvider.overrideWithValue(_guardFor(compromised)),
        moderationRepositoryProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    await expectLater(
      container.read(
        submitVoteProvider(
          const VoteSubmission(appealId: 'appeal-1', vote: 'approve'),
        ).future,
      ),
      throwsA(
        isA<ModerationException>().having(
          (error) => error.code,
          'code',
          ErrorCodes.deviceIntegrityBlocked,
        ),
      ),
    );

    expect(repo.submitVoteCalled, isFalse);
  });

  test('allows appeal submission on clean devices', () async {
    final clean = DeviceSecurityState(
      isRootedOrJailbroken: false,
      isEmulator: false,
      isDebugBuild: false,
      lastCheckedAt: DateTime.now(),
    );

    final repo = _FakeModerationRepository();
    final container = ProviderContainer(
      overrides: [
        deviceIntegrityGuardProvider.overrideWithValue(_guardFor(clean)),
        moderationRepositoryProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    await container.read(
      submitAppealProvider(
        const AppealSubmission(
          contentId: 'content-1',
          contentType: 'post',
          appealType: 'false_positive',
          appealReason: 'context_missing',
          userStatement: 'statement',
        ),
      ).future,
    );

    expect(repo.submitAppealCalled, isTrue);
  });
}
