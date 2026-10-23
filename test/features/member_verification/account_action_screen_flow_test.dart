import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/design_system/components/lyth_text_field.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/member_verification/application/recent_account_action_providers.dart';
import 'package:lythaus/features/privacy/privacy_settings_screen.dart';
import 'package:lythaus/features/privacy/state/privacy_controller.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';
import 'package:lythaus/services/service_providers.dart';
import 'package:lythaus/ui/screens/rewards/rewards_dashboard.dart';
import '../privacy/test_doubles.dart';

class _Auth extends AuthService {
  _Auth() : super(authUrl: 'https://api.example.invalid/api');
  @override
  Future<User?> getCurrentUser() async => User(
    id: 'a',
    email: 'a@example.invalid',
    role: UserRole.user,
    tier: UserTier.bronze,
    reputationScore: 0,
    createdAt: DateTime.utc(2026),
    lastLoginAt: DateTime.utc(2026),
  );
  @override
  Future<String?> getJwtToken() async => 'existing-access';
  @override
  Future<Map<String, String>?> accountActionSessionHeaders() async => {
    'Authorization': 'Bearer existing-access',
    'X-Lythaus-Session-Binding': 'existing-refresh',
  };
}

ResponseBody _json(int status, Object data) => ResponseBody.fromString(
  jsonEncode(data),
  status,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);

class _Adapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  bool redeemed = false;
  bool deletion = false;
  bool timeoutAfterProof = false;
  String? uncertainKey;
  int verifications = 0;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (options.method == 'GET') {
      return _json(200, {'request': null, 'retryAfterSeconds': 0});
    }
    if (uncertainKey != null &&
        options.headers['Idempotency-Key'] == uncertainKey) {
      return _json(409, {'error': 'idempotency_outcome_unknown'});
    }
    if (options.uri.path.endsWith('recent-verification')) {
      verifications++;
      return _json(201, {
        'proof': '019b2222-2222-7222-8222-222222222222.${'a' * 64}',
        'action': deletion ? 'account_delete' : 'reward_claim',
      });
    }
    if (!options.headers.containsKey('X-Lythaus-Action-Verification')) {
      return _json(403, {'error': 'recent_authentication_required'});
    }
    if (timeoutAfterProof) {
      uncertainKey = options.headers['Idempotency-Key'] as String;
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.receiveTimeout,
      );
    }
    redeemed = true;
    return deletion
        ? _json(202, {
            'requestId': 'delete-1',
            'requestType': 'delete',
            'state': 'received',
            'acceptedAt': '2026-10-23T12:00:00Z',
          })
        : _json(201, {
            'id': 'red-1',
            'rewardId': 'example',
            'rewardLevel': 1,
            'rewardTitle': 'Example reward',
            'redeemedAt': '2026-10-23T12:00:00Z',
            'status': 'redeemed',
          });
  }

  @override
  void close({bool force = false}) {}
}

RewardsSnapshot _snapshot(bool redeemed) => RewardsSnapshot.fromJson({
  'subscriptionTier': 'premium',
  'reputationLevel': 3,
  'reputationBand': 'established',
  'availableRewardLevels': [1],
  'maxOptionsPerLevel': 1,
  'redemptionStatus': 'active',
  'fraudRiskStatus': 'normal',
  'redemptionHistory': <Object>[],
  'affiliateDisclosure': 'Synthetic fixture',
  'offers': [
    {
      'id': 'example',
      'rewardLevel': 1,
      'title': 'Example reward',
      'description': 'Synthetic offer',
      'partnerName': 'Fixture',
      'locked': false,
      'redeemed': redeemed,
    },
  ],
});

Future<ProviderContainer> _open(WidgetTester tester, _Adapter adapter) async {
  await tester.binding.setSurfaceSize(const Size(1200, 1800));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final dio = Dio(BaseOptions(baseUrl: 'https://api.example.invalid/api'))
    ..httpClientAdapter = adapter;
  dio.interceptors.add(CanonicalApiPathInterceptor());
  final container = ProviderContainer(
    overrides: [
      enhancedAuthServiceProvider.overrideWithValue(_Auth()),
      secureDioProvider.overrideWithValue(dio),
      secureStorageProvider.overrideWithValue(MemoryPrivacyStorage()),
      analyticsClientProvider.overrideWithValue(const NullAnalyticsClient()),
      recentAccountActionClientEnabledProvider.overrideWithValue(true),
      rewardsSnapshotProvider.overrideWith(
        (ref, _) async => _snapshot(adapter.redeemed),
      ),
      monthlyRewardsViewProvider.overrideWith(
        (_) async => throw StateError('Fixture unavailable'),
      ),
      monthlyReputationReportProvider.overrideWith(
        (_, _) async => throw StateError('Fixture unavailable'),
      ),
    ],
  );
  addTearDown(container.dispose);
  container.read(authStateProvider);
  for (var i = 0; i < 8; i++) {
    await Future<void>.value();
  }
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: adapter.deletion
            ? const PrivacySettingsScreen()
            : const RewardsDashboardScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

Future<void> _begin(WidgetTester tester, {required bool deletion}) async {
  final button = find.text(deletion ? 'Request account deletion' : 'Redeem');
  await tester.ensureVisible(button);
  await tester.tap(button);
  await tester.pumpAndSettle();
  if (deletion) {
    await tester.enterText(find.byType(LythTextField), 'DELETE');
    await tester.pump();
    await tester.tap(find.text('Delete').last);
    // The privacy progress overlay intentionally continues animating beneath
    // the password dialog. Wait for the visible milestone, not global idle.
    for (
      var i = 0;
      i < 30 && find.text('Verify your account').evaluate().isEmpty;
      i++
    ) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(find.text('Verify your account'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 350));
  }
}

void main() {
  for (final deletion in [false, true]) {
    testWidgets(
      'actual ${deletion ? 'deletion' : 'reward'} screen verifies password and retries only once with a fresh key',
      (tester) async {
        final adapter = _Adapter()..deletion = deletion;
        await _open(tester, adapter);
        await _begin(tester, deletion: deletion);
        expect(find.text('Verify your account'), findsOneWidget);
        expect(adapter.requests.where((r) => r.method == 'POST'), hasLength(1));
        await tester.enterText(
          find.byType(TextField).last,
          'existing password',
        );
        await tester.tap(find.text('Verify and continue'));
        await tester.pumpAndSettle();
        final posts = adapter.requests
            .where((r) => r.method == 'POST')
            .toList();
        expect(posts, hasLength(3));
        expect(
          posts[0].headers['Idempotency-Key'],
          isNot(posts[2].headers['Idempotency-Key']),
        );
        expect(posts[1].data, {
          'password': 'existing password',
          'operation': {
            'method': 'POST',
            'path': posts[2].uri.path,
            'body': deletion ? '{"requestType":"delete"}' : '',
          },
        });
        expect(posts[2].headers['X-Lythaus-Action-Verification'], isNotNull);
        expect(adapter.verifications, 1);
        expect(find.text('Verify your account'), findsNothing);
        expect(
          find.textContaining(
            deletion
                ? 'Deletion request submitted.'
                : 'Reward redeemed successfully.',
          ),
          findsWidgets,
        );
      },
    );

    testWidgets(
      'actual ${deletion ? 'deletion' : 'reward'} screen cancellation leaves the confirmed challenge without a mutation retry',
      (tester) async {
        final adapter = _Adapter()..deletion = deletion;
        await _open(tester, adapter);
        await _begin(tester, deletion: deletion);
        await tester.tap(find.text('Cancel').last);
        await tester.pumpAndSettle();
        expect(adapter.requests.where((r) => r.method == 'POST'), hasLength(1));
        expect(adapter.verifications, 0);
        expect(find.textContaining('Verification cancelled.'), findsWidgets);
      },
    );
  }

  for (final deletion in [false, true]) {
    testWidgets(
      'actual ${deletion ? 'deletion' : 'reward'} unknown outcome reuses its fresh key and never verifies twice',
      (tester) async {
        final adapter = _Adapter()
          ..deletion = deletion
          ..timeoutAfterProof = true;
        final container = await _open(tester, adapter);
        await _begin(tester, deletion: deletion);
        await tester.enterText(
          find.byType(TextField).last,
          'existing password',
        );
        await tester.tap(find.text('Verify and continue'));
        await tester.pumpAndSettle();
        final retryKey = adapter.uncertainKey;
        expect(retryKey, isNotNull);
        if (deletion) {
          final refresh = container
              .read(privacyControllerProvider.notifier)
              .refreshStatus();
          await tester.pumpAndSettle();
          await refresh;
        }
        final button = find.text(
          deletion ? 'Request account deletion' : 'Redeem',
        );
        await tester.ensureVisible(button);
        await tester.tap(button);
        await tester.pumpAndSettle();
        if (deletion) {
          await tester.enterText(find.byType(LythTextField), 'DELETE');
          await tester.pump();
          await tester.tap(find.text('Delete').last);
          await tester.pumpAndSettle();
        }
        final posts = adapter.requests
            .where((r) => r.method == 'POST')
            .toList();
        expect(posts, hasLength(4));
        expect(posts.last.headers['Idempotency-Key'], retryKey);
        expect(
          posts.last.headers.containsKey('X-Lythaus-Action-Verification'),
          isFalse,
        );
        expect(adapter.verifications, 1);
        expect(find.text('Verify your account'), findsNothing);
      },
    );
  }

  testWidgets(
    'account switch closes actual password dialog and cannot submit verification for replacement owner',
    (tester) async {
      final adapter = _Adapter();
      final container = await _open(tester, adapter);
      await _begin(tester, deletion: false);
      container
          .read(authStateProvider.notifier)
          .setUser(
            User(
              id: 'b',
              email: 'b@example.invalid',
              role: UserRole.user,
              tier: UserTier.bronze,
              reputationScore: 0,
              createdAt: DateTime.utc(2026),
              lastLoginAt: DateTime.utc(2026),
            ),
          );
      await tester.pumpAndSettle();
      expect(find.text('Verify your account'), findsNothing);
      expect(adapter.requests.where((r) => r.method == 'POST'), hasLength(1));
      expect(adapter.verifications, 0);
    },
  );
}
