import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_authenticator.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_preferences_store.dart';
import 'package:lythaus/features/member_verification/application/draft_device_unlock_controller.dart';
import 'package:lythaus/features/member_verification/domain/device_unlock_preference.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';

import '../test/helpers/feed_session.dart';

class _RewardAdapter implements HttpClientAdapter {
  final requests = <String, int>{};

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.update(options.path, (count) => count + 1, ifAbsent: () => 1);
    final payload = switch (options.path) {
      '/rewards/me' => {
        'subscriptionTier': 'free',
        'reputationLevel': 4,
        'reputationBand': 'established',
        'availableRewardLevels': [4],
        'maxOptionsPerLevel': 2,
        'redemptionStatus': 'active',
        'fraudRiskStatus': 'normal',
        'offers': [
          {
            'id': 'offer-4',
            'rewardLevel': 4,
            'title': 'Synthetic offer',
            'description': 'Server-provided fixture',
            'partnerName': 'Fixture partner',
            'locked': false,
            'redeemed': false,
          },
        ],
        'redemptionHistory': <Object>[],
        'affiliateDisclosure': 'Synthetic disclosure',
      },
      '/rewards/me/monthly' => {
        'state': 'ready',
        'reasonCode': null,
        'effectiveMonth': '2026-10',
        'currentLevel': 4,
        'sourceMonth': '2026-09',
        'sourceScore': 6000,
        'snapshot': {
          'state': 'confirmed',
          'reasonCode': 'source_month_assessed',
          'effectiveMonth': '2026-10',
          'sourceMonth': '2026-09',
          'sourceScore': 6000,
          'level': 4,
          'policyVersion': 'lythaus-monthly-rewards-2026-10-v1',
        },
        'selection': {'state': 'ready', 'reasonCode': null},
      },
      _ => throw StateError('Unexpected endpoint ${options.path}'),
    };
    return ResponseBody.fromString(
      jsonEncode(payload),
      200,
      headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
    );
  }

  @override
  void close({bool force = false}) {}
}

class _LocalAuthenticator implements DeviceUnlockAuthenticator {
  var availabilityCalls = 0;
  var unlockCalls = 0;

  @override
  Future<DeviceUnlockAvailability> availability() async {
    availabilityCalls++;
    return DeviceUnlockAvailability.available;
  }

  @override
  Future<DeviceUnlockResult> unlock() async {
    unlockCalls++;
    return DeviceUnlockResult.unlocked;
  }

  @override
  Future<void> cancel() async {}
}

void main() {
  test('local device unlock preference leaves server reward projection unchanged', () async {
    FlutterSecureStorage.setMockInitialValues({
      'jwt': 'unchanged-access',
      'refreshToken': 'unchanged-refresh',
      'userData': 'unchanged-user',
    });
    final adapter = _RewardAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'https://api.lythaus.test'))
      ..httpClientAdapter = adapter;
    final auth = FeedTestAuth(feedTestUser('account-a'));
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWith((ref) => auth),
        jwtProvider.overrideWith((ref) async => 'synthetic-access-token'),
        secureDioProvider.overrideWithValue(dio),
      ],
    );
    addTearDown(container.dispose);
    final rewardsRevision = container.read(authSessionRevisionProvider);
    final tokenRevision = container.read(tokenVersionProvider);
    final rewardSubscription = container.listen(
      rewardsSnapshotProvider(rewardsRevision),
      (_, _) {},
    );
    final monthlySubscription = container.listen(
      monthlyRewardsViewProvider,
      (_, _) {},
    );
    addTearDown(rewardSubscription.close);
    addTearDown(monthlySubscription.close);

    final rewardsBefore = await container.read(
      rewardsSnapshotProvider(rewardsRevision).future,
    );
    final monthlyBefore = await container.read(monthlyRewardsViewProvider.future);
    expect(rewardsBefore.reputationLevel, 4);
    expect(rewardsBefore.availableRewardLevels, [4]);
    expect(rewardsBefore.offers.single.id, 'offer-4');
    expect(monthlyBefore.rewardsReady, isTrue);
    expect(monthlyBefore.currentLevel, 4);
    expect(adapter.requests, {
      '/rewards/me': 1,
      '/rewards/me/monthly': 1,
    });

    final authenticator = _LocalAuthenticator();
    final controller = DraftDeviceUnlockController(
      accountId: 'account-a',
      store: const SecureDeviceUnlockPreferencesStore(),
      authenticator: authenticator,
      enabled: true,
    );
    addTearDown(controller.dispose);
    await controller.initialize();
    await controller.savePreference(DeviceUnlockPreference.everyReopen);
    await controller.unlock();

    expect(controller.state.preference, DeviceUnlockPreference.everyReopen);
    expect(controller.state.status, DraftDeviceUnlockStatus.unlocked);
    expect(authenticator.availabilityCalls, 1);
    expect(authenticator.unlockCalls, 1);
    expect(
      await const SecureDeviceUnlockPreferencesStore().load('account-a'),
      DeviceUnlockPreference.everyReopen,
    );
    expect(adapter.requests, {
      '/rewards/me': 1,
      '/rewards/me/monthly': 1,
    });

    final rewardsAfter = container.read(
      rewardsSnapshotProvider(rewardsRevision),
    ).requireValue;
    final monthlyAfter = container.read(monthlyRewardsViewProvider).requireValue;
    expect(rewardsAfter.reputationLevel, rewardsBefore.reputationLevel);
    expect(rewardsAfter.availableRewardLevels, rewardsBefore.availableRewardLevels);
    expect(rewardsAfter.offers.map((offer) => offer.id), ['offer-4']);
    expect(monthlyAfter.rewardsReady, monthlyBefore.rewardsReady);
    expect(monthlyAfter.currentLevel, monthlyBefore.currentLevel);
    expect(monthlyAfter.sourceScore, monthlyBefore.sourceScore);
    expect(container.read(authSessionRevisionProvider), rewardsRevision);
    expect(container.read(tokenVersionProvider), tokenRevision);

    final storedAuthValues = await const FlutterSecureStorage().readAll();
    expect(storedAuthValues['jwt'], 'unchanged-access');
    expect(storedAuthValues['refreshToken'], 'unchanged-refresh');
    expect(storedAuthValues['userData'], 'unchanged-user');
    expect(storedAuthValues.length, 4);
  });
}
