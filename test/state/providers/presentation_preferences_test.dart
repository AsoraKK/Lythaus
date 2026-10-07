import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/profile/application/guest_preferences_storage.dart';
import 'package:lythaus/features/profile/domain/presentation_preferences.dart';
import 'package:lythaus/state/providers/settings_providers.dart';

Future<void> flush() => Future<void>.delayed(Duration.zero);

DioException apiError(String code, int status) => DioException(
  requestOptions: RequestOptions(path: '/api/users/me'),
  response: Response(
    requestOptions: RequestOptions(path: '/api/users/me'),
    statusCode: status,
    data: {'error': code},
  ),
);

void main() {
  test(
    'a queued initial load cannot start after synchronous session invalidation',
    () async {
      var reads = 0;
      final controller = SettingsController(
        ownerId: 'owner-a',
        load: () async {
          reads++;
          return const PresentationPreferences(leftHandedMode: true);
        },
      );
      addTearDown(controller.dispose);
      controller.clearSession();
      await flush();
      expect(reads, 0);
      expect(controller.state.leftHandedMode, isFalse);
      expect(controller.state.preferencesOwnerId, isNull);
    },
  );
  test(
    'saved account choices load and only acknowledged changes become effective',
    () async {
      var saved = const PresentationPreferences(
        leftHandedMode: true,
        horizontalSwipeEnabled: false,
        version: 7,
      );
      final acknowledgement = Completer<PresentationPreferences>();
      final controller = SettingsController(
        ownerId: 'owner-a',
        load: () async => saved,
        save: (preferences, key) => acknowledgement.future,
      );
      addTearDown(controller.dispose);
      expect(controller.state.preferencesLoading, isTrue);
      expect(controller.state.leftHandedMode, isFalse);
      await flush();
      expect(controller.state.leftHandedMode, isTrue);
      final saving = controller.savePreferences(
        leftHandedMode: false,
        horizontalSwipeEnabled: true,
      );
      expect(controller.state.leftHandedMode, isTrue);
      expect(controller.state.preferencesSaving, isTrue);
      saved = const PresentationPreferences(version: 8);
      acknowledgement.complete(saved);
      await saving;
      expect(controller.state.leftHandedMode, isFalse);
      expect(controller.state.preferencesVersion, 8);
      expect(controller.state.preferencesMessage, 'Saved to your account.');
    },
  );

  test(
    'failed save retries immutable payload and key; repeated taps cannot duplicate writes',
    () async {
      final writes = <PresentationPreferences>[];
      final keys = <String>[];
      final first = Completer<PresentationPreferences>();
      final controller = SettingsController(
        ownerId: 'owner-a',
        load: () async => const PresentationPreferences(),
        save: (preferences, key) async {
          writes.add(preferences);
          keys.add(key);
          if (writes.length == 1) return first.future;
          return PresentationPreferences(
            leftHandedMode: preferences.leftHandedMode,
            horizontalSwipeEnabled: preferences.horizontalSwipeEnabled,
            version: 2,
          );
        },
      );
      addTearDown(controller.dispose);
      await flush();
      final save = controller.savePreferences(
        leftHandedMode: true,
        horizontalSwipeEnabled: false,
      );
      await controller.savePreferences(
        leftHandedMode: false,
        horizontalSwipeEnabled: true,
      );
      expect(writes, hasLength(1));
      first.completeError(StateError('connection interrupted'));
      await save;
      expect(controller.state.preferencesRetryPending, isTrue);
      expect(controller.state.leftHandedMode, isFalse);
      await controller.savePreferences(
        leftHandedMode: false,
        horizontalSwipeEnabled: true,
      );
      expect(keys[1], keys[0]);
      expect(identical(writes[1], writes[0]), isTrue);
      expect(writes[1].leftHandedMode, isTrue);
      expect(controller.state.preferencesRetryPending, isFalse);
    },
  );

  test(
    'revision conflict loads current server choices without overwriting them',
    () async {
      var current = const PresentationPreferences();
      var writes = 0;
      final controller = SettingsController(
        ownerId: 'owner-a',
        load: () async => current,
        save: (preferences, key) async {
          writes++;
          current = const PresentationPreferences(
            horizontalSwipeEnabled: false,
            version: 4,
          );
          throw apiError('presentation_preferences_conflict', 409);
        },
      );
      addTearDown(controller.dispose);
      await flush();
      await controller.savePreferences(
        leftHandedMode: true,
        horizontalSwipeEnabled: true,
      );
      expect(writes, 1);
      expect(controller.state.leftHandedMode, isFalse);
      expect(controller.state.horizontalSwipeEnabled, isFalse);
      expect(controller.state.preferencesVersion, 4);
      expect(controller.state.preferencesMessage, contains('another device'));
      expect(controller.state.preferencesRetryPending, isFalse);
    },
  );

  test(
    'missing schema and failed load never claim locally saved account preferences',
    () async {
      var fails = false;
      var writes = 0;
      final controller = SettingsController(
        ownerId: 'owner-a',
        load: () async {
          if (fails) throw StateError('offline');
          return null;
        },
        save: (preferences, key) async {
          writes++;
          return preferences;
        },
      );
      addTearDown(controller.dispose);
      await flush();
      expect(controller.state.preferencesAvailable, isFalse);
      expect(
        controller.state.preferencesMessage,
        contains('not available yet'),
      );
      await controller.savePreferences(
        leftHandedMode: true,
        horizontalSwipeEnabled: false,
      );
      expect(writes, 0);
      fails = true;
      await controller.reload();
      expect(controller.state.preferencesMessage, contains('Unable to load'));
      expect(controller.state.preferencesAvailable, isFalse);
      await controller.resetGuestPreferences();
      expect(writes, 0);
    },
  );

  test(
    'session invalidation clears private choices synchronously and fences late save acknowledgement',
    () async {
      final pending = Completer<PresentationPreferences>();
      final controller = SettingsController(
        ownerId: 'owner-a',
        load: () async => const PresentationPreferences(
          leftHandedMode: true,
          horizontalSwipeEnabled: false,
          version: 9,
        ),
        save: (preferences, key) => pending.future,
      );
      addTearDown(controller.dispose);
      await flush();
      final save = controller.savePreferences(
        leftHandedMode: false,
        horizontalSwipeEnabled: true,
      );
      expect(controller.pendingPreferences, isNotNull);
      controller.clearSession();
      expect(controller.pendingPreferences, isNull);
      expect(controller.state.preferencesOwnerId, isNull);
      expect(controller.state.leftHandedMode, isFalse);
      expect(controller.state.horizontalSwipeEnabled, isTrue);
      pending.complete(
        const PresentationPreferences(leftHandedMode: true, version: 10),
      );
      await save;
      expect(controller.pendingPreferences, isNull);
      expect(controller.state.leftHandedMode, isFalse);
      expect(controller.state.preferencesVersion, 1);
      expect(controller.state.preferencesMessage, isNull);
    },
  );

  test(
    'late initial loads and disposed controllers cannot restore old private choices',
    () async {
      final initial = Completer<PresentationPreferences>();
      final controller = SettingsController(
        ownerId: 'owner-a',
        load: () => initial.future,
      );
      await flush();
      controller.clearSession();
      initial.complete(const PresentationPreferences(leftHandedMode: true));
      await flush();
      expect(controller.state.leftHandedMode, isFalse);
      controller.dispose();
      final another = Completer<PresentationPreferences>();
      final disposed = SettingsController(
        ownerId: 'owner-a',
        load: () => another.future,
      );
      await flush();
      disposed.dispose();
      another.completeError(StateError('late network failure'));
      await flush();
    },
  );

  test(
    'overlapping reloads preserve the latest success over stale success or failure',
    () async {
      for (final fails in [false, true]) {
        final initial = Completer<PresentationPreferences>();
        var reads = 0;
        final controller = SettingsController(
          ownerId: 'owner-a',
          load: () async {
            if (++reads == 1) return initial.future;
            return const PresentationPreferences(
              horizontalSwipeEnabled: false,
              version: 3,
            );
          },
        );
        await flush();
        await controller.reload();
        if (fails) {
          initial.completeError(StateError('old failure'));
        } else {
          initial.complete(const PresentationPreferences(leftHandedMode: true));
        }
        await flush();
        expect(controller.state.preferencesVersion, 3);
        expect(controller.state.leftHandedMode, isFalse);
        expect(controller.state.horizontalSwipeEnabled, isFalse);
        controller.dispose();
      }
    },
  );

  test(
    'guest choices survive restart in a dedicated key without account data',
    () async {
      FlutterSecureStorage.setMockInitialValues({
        'access_token': 'synthetic-credential',
        'analytics_consent': 'sentinel',
      });
      const storage = SecureGuestPreferencesStorage();
      expect((await storage.load()).leftHandedMode, isFalse);
      await storage.save(
        const PresentationPreferences(
          leftHandedMode: true,
          horizontalSwipeEnabled: false,
        ),
      );
      final reopened = await const SecureGuestPreferencesStorage().load();
      expect(reopened.leftHandedMode, isTrue);
      expect(reopened.horizontalSwipeEnabled, isFalse);
      final keys = await const FlutterSecureStorage().readAll();
      expect(keys['access_token'], 'synthetic-credential');
      expect(keys['analytics_consent'], 'sentinel');
      expect(keys[SecureGuestPreferencesStorage.key], isNot(contains('owner')));
    },
  );

  test(
    'corrupt guest storage requires explicit reset and failed storage save remains unconfirmed',
    () async {
      FlutterSecureStorage.setMockInitialValues({
        SecureGuestPreferencesStorage.key: 'corrupt-json',
      });
      const storage = SecureGuestPreferencesStorage();
      final controller = SettingsController(
        load: storage.load,
        save: (preferences, key) async {
          await storage.save(preferences);
          return preferences;
        },
      );
      addTearDown(controller.dispose);
      await flush();
      expect(controller.state.preferencesAvailable, isFalse);
      await controller.resetGuestPreferences();
      expect(controller.state.preferencesAvailable, isTrue);
      expect(
        controller.state.preferencesMessage,
        'Saved on this device for guest use.',
      );
      expect((await storage.load()).leftHandedMode, isFalse);
      final failed = SettingsController(
        load: () async => const PresentationPreferences(),
        save: (preferences, key) async =>
            throw StateError('storage unavailable'),
      );
      addTearDown(failed.dispose);
      await flush();
      await failed.savePreferences(
        leftHandedMode: true,
        horizontalSwipeEnabled: false,
      );
      expect(failed.state.preferencesRetryPending, isTrue);
      expect(failed.state.leftHandedMode, isFalse);
    },
  );
}
