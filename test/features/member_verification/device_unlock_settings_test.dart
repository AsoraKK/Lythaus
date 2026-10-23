import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_authenticator.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_preferences_store.dart';
import 'package:lythaus/features/member_verification/application/device_unlock_settings_providers.dart';
import 'package:lythaus/features/member_verification/domain/device_unlock_preference.dart';
import 'package:lythaus/features/member_verification/presentation/device_unlock_settings_card.dart';
import 'package:lythaus/ui/screens/profile/account_security_screen.dart';

final _account = StateProvider<String?>((_) => 'a');
User _user(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

class _Store implements DeviceUnlockPreferencesStore {
  final values = <String, DeviceUnlockPreference>{};
  int loads = 0, writes = 0;
  bool fail = false;
  @override
  Future<DeviceUnlockPreference> load(String id) async {
    loads++;
    if (fail) throw StateError('unavailable');
    return values[id] ?? DeviceUnlockPreference.off;
  }

  @override
  Future<void> save(String id, DeviceUnlockPreference preference) async {
    if (fail) throw StateError('unavailable');
    writes++;
    values[id] = preference;
  }
}

class _Authenticator implements DeviceUnlockAuthenticator {
  DeviceUnlockAvailability supported = DeviceUnlockAvailability.available;
  DeviceUnlockResult result = DeviceUnlockResult.unlocked;
  Completer<DeviceUnlockResult>? pending;
  int probes = 0, prompts = 0, cancellations = 0;
  @override
  Future<DeviceUnlockAvailability> availability() async {
    probes++;
    return supported;
  }

  @override
  Future<DeviceUnlockResult> unlock() async {
    prompts++;
    return pending?.future ?? result;
  }

  @override
  Future<void> cancel() async {
    cancellations++;
  }
}

class _Harness {
  final store = _Store();
  final authenticator = _Authenticator();
  late ProviderContainer container;
  Future<void> open(WidgetTester tester, {bool enabled = true}) async {
    await tester.binding.setSurfaceSize(const Size(720, 1500));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    container = ProviderContainer(
      overrides: [
        deviceUnlockSettingsEnabledProvider.overrideWithValue(enabled),
        currentUserProvider.overrideWith((ref) {
          final id = ref.watch(_account);
          return id == null ? null : _user(id);
        }),
        authSessionRevisionProvider.overrideWith(
          (ref) => AuthSessionRevision(ref.watch(_account.notifier)),
        ),
        deviceUnlockPreferencesStoreProvider.overrideWithValue(store),
        deviceUnlockAuthenticatorProvider.overrideWithValue(authenticator),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: AccountSecurityScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  DropdownButton<DeviceUnlockPreference> dropdown(WidgetTester tester) =>
      tester.widget(find.byType(DropdownButton<DeviceUnlockPreference>));
  Future<void> choose(
    WidgetTester tester,
    String label, {
    bool settle = true,
  }) async {
    await tester.tap(find.byType(DropdownButton<DeviceUnlockPreference>));
    await tester.pumpAndSettle();
    await tester.tap(find.text(label).last);
    if (settle) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump();
    }
  }
}

void main() {
  testWidgets(
    'default flag performs no store/native work and exposes no preference controls',
    (tester) async {
      final h = _Harness();
      await h.open(tester, enabled: false);
      expect(find.byType(DeviceUnlockSettingsCard), findsNothing);
      expect(
        h.store.loads +
            h.store.writes +
            h.authenticator.probes +
            h.authenticator.prompts,
        0,
      );
      expect(find.text('Session expiry'), findsOneWidget);
    },
  );

  testWidgets(
    'all five approved choices persist per account only after OS confirmation',
    (tester) async {
      final h = _Harness();
      await h.open(tester);
      expect(h.dropdown(tester).value, DeviceUnlockPreference.off);
      expect(
        h.dropdown(tester).items!.map((item) => item.value),
        DeviceUnlockPreference.values,
      );
      await h.choose(tester, 'After 5 minutes away');
      expect(h.authenticator.prompts, 1);
      expect(h.store.values['a'], DeviceUnlockPreference.afterFiveMinutes);
      h.container.read(_account.notifier).state = 'b';
      await tester.pumpAndSettle();
      expect(h.dropdown(tester).value, DeviceUnlockPreference.off);
      await h.choose(tester, 'Every reopen');
      expect(h.store.values['b'], DeviceUnlockPreference.everyReopen);
      expect(h.store.values['a'], DeviceUnlockPreference.afterFiveMinutes);
      expect(
        find.textContaining('app-wide protection is inactive'),
        findsOneWidget,
      );
      expect(
        find.textContaining('Monthly eligibility mapping is pending'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'cancelled confirmation and lockout retain old choice; Off is never blocked by an award',
    (tester) async {
      final h = _Harness();
      h.store.values['a'] = DeviceUnlockPreference.afterFiveMinutes;
      await h.open(tester);
      h.authenticator.result = DeviceUnlockResult.cancelled;
      await h.choose(tester, 'After 1 minute away');
      expect(find.textContaining('Cancelled.'), findsOneWidget);
      expect(h.store.values['a'], DeviceUnlockPreference.afterFiveMinutes);
      h.authenticator.result = DeviceUnlockResult.lockedOut;
      await h.choose(tester, 'Every reopen');
      expect(find.textContaining('locked out'), findsOneWidget);
      final prompts = h.authenticator.prompts;
      await h.choose(tester, 'Off');
      expect(h.store.values['a'], DeviceUnlockPreference.off);
      expect(h.authenticator.prompts, prompts);
    },
  );

  testWidgets(
    'web/unsupported OS makes enabled choices unavailable while keeping Off and browsing available',
    (tester) async {
      final h = _Harness();
      h.authenticator.supported = DeviceUnlockAvailability.unsupported;
      await h.open(tester);
      for (final item in h.dropdown(tester).items!) {
        expect(item.enabled, item.value == DeviceUnlockPreference.off);
      }
      expect(
        find.textContaining('OS authentication is unavailable'),
        findsOneWidget,
      );
      expect(h.authenticator.prompts, 0);
      expect(find.text('Signed-in account'), findsOneWidget);
    },
  );

  testWidgets(
    'explicit cancellation ignores late success without saving an enabled choice',
    (tester) async {
      final h = _Harness();
      h.authenticator.pending = Completer<DeviceUnlockResult>();
      await h.open(tester);
      await h.choose(tester, 'Every reopen', settle: false);
      await tester.tap(find.text('Cancel device confirmation'));
      await tester.pump();
      h.authenticator.pending!.complete(DeviceUnlockResult.unlocked);
      await tester.pumpAndSettle();
      expect(h.store.writes, 0);
      expect(h.dropdown(tester).value, DeviceUnlockPreference.off);
      expect(h.authenticator.cancellations, 1);
    },
  );

  testWidgets(
    'system-sheet inactive is tolerated; actual background/resume cancels late confirmation',
    (tester) async {
      final h = _Harness();
      h.authenticator.pending = Completer<DeviceUnlockResult>();
      await h.open(tester);
      await h.choose(tester, 'After 15 minutes away', settle: false);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump();
      expect(h.authenticator.cancellations, 0);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      h.authenticator.pending!.complete(DeviceUnlockResult.unlocked);
      await tester.pumpAndSettle();
      expect(h.authenticator.cancellations, 1);
      expect(h.store.writes, 0);
    },
  );

  testWidgets(
    'A guest A transition fences in-flight confirmation synchronously',
    (tester) async {
      final h = _Harness();
      h.authenticator.pending = Completer<DeviceUnlockResult>();
      await h.open(tester);
      await h.choose(tester, 'Every reopen', settle: false);
      final old = h.container.read(deviceUnlockSettingsProvider('a').notifier);
      h.container.read(_account.notifier).state = null;
      h.container.read(_account.notifier).state = 'a';
      expect(old.isAuthenticating, isFalse);
      h.authenticator.pending!.complete(DeviceUnlockResult.unlocked);
      await tester.pumpAndSettle();
      expect(h.store.writes, 0);
      expect(h.dropdown(tester).value, DeviceUnlockPreference.off);
    },
  );

  testWidgets(
    'unconfirmed storage can reload without reporting a changed preference',
    (tester) async {
      final h = _Harness();
      h.store.fail = true;
      await h.open(tester);
      expect(find.textContaining('could not be confirmed'), findsOneWidget);
      h.store.fail = false;
      await tester.tap(find.text('Reload choice and device support'));
      await tester.pumpAndSettle();
      expect(h.dropdown(tester).items!.every((item) => item.enabled), isTrue);
      h.store.fail = true;
      await h.choose(tester, 'Every reopen');
      expect(h.dropdown(tester).value, DeviceUnlockPreference.off);
      expect(h.store.writes, 0);
      expect(find.textContaining('could not be confirmed'), findsOneWidget);
    },
  );
}
