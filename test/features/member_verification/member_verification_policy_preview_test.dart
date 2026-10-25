import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/member_verification/domain/device_unlock_preference.dart';
import 'package:lythaus/features/member_verification/presentation/member_verification_policy_preview.dart';
import 'package:lythaus/ui/screens/profile/account_security_screen.dart';

import '../../golden_test_utils.dart';
import '../../helpers/inactive_state_screenshot_capture.dart';

final _captureKey = GlobalKey();

void main() {
  setUpAll(loadFontsForGoldenTests);

  final user = User(
    id: 'synthetic',
    email: 'synthetic@example.invalid',
    role: UserRole.user,
    tier: UserTier.bronze,
    reputationScore: 0,
    createdAt: DateTime.utc(2026),
    lastLoginAt: DateTime.utc(2026),
  );

  testWidgets('default flag leaves the account security screen unchanged', (
    tester,
  ) async {
    final container = ProviderContainer(
      overrides: [currentUserProvider.overrideWithValue(user)],
    );
    addTearDown(container.dispose);
    expect(container.read(memberVerificationPreviewEnabledProvider), isFalse);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: AccountSecurityScreen()),
      ),
    );
    expect(find.byType(MemberVerificationPolicyPreview), findsNothing);
    expect(find.text('Session expiry'), findsOneWidget);
    expect(find.text('Sign out of all sessions'), findsOneWidget);
  });

  testWidgets('flag exposes only an honest, read-only policy preview', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 1500));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWithValue(user),
          memberVerificationPreviewEnabledProvider.overrideWithValue(true),
        ],
        child: MaterialApp(
          home: RepaintBoundary(
            key: _captureKey,
            child: const AccountSecurityScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Member verification: draft policy'), findsOneWidget);
    for (final preference in DeviceUnlockPreference.values) {
      expect(find.text(preference.label), findsOneWidget);
    }
    expect(
      find.textContaining('Session renewal is not a fresh login.'),
      findsOneWidget,
    );
    expect(
      find.textContaining(
        'Device unlock remains a local preference and earns no points',
      ),
      findsOneWidget,
    );
    expect(
      find.textContaining('up to 24 cumulative hours of gaps'),
      findsOneWidget,
    );
    expect(
      find.textContaining(
        'Qualifying methods share one benefit and do not stack',
      ),
      findsOneWidget,
    );
    expect(
      find.textContaining(
        'changing supported methods preserves qualification while coverage stays continuous',
      ),
      findsOneWidget,
    );
    expect(
      find.textContaining(
        'refreshing status does not establish qualifying server coverage',
      ),
      findsOneWidget,
    );
    expect(find.byType(Switch), findsNothing);
    expect(find.byType(Checkbox), findsNothing);
    expect(find.byType(DropdownButton<DeviceUnlockPreference>), findsNothing);
    expect(tester.takeException(), isNull);
    await captureInactiveStateScreenshot(
      tester,
      _captureKey,
      'account-security-inactive-preview',
    );
  });

  testWidgets('guests see no member verification preview', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWithValue(null),
          memberVerificationPreviewEnabledProvider.overrideWithValue(true),
        ],
        child: const MaterialApp(home: AccountSecurityScreen()),
      ),
    );
    expect(find.byType(MemberVerificationPolicyPreview), findsNothing);
  });
}
