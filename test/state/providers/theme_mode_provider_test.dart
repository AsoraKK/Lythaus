import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/state/providers/theme_mode_provider.dart';

class _Storage implements ThemeModeStorage {
  ThemeMode mode = ThemeMode.system;
  Future<ThemeMode> Function()? onLoad;
  Future<void> Function(ThemeMode)? onSave;
  final writes = <ThemeMode>[];

  @override
  Future<ThemeMode> load() => onLoad?.call() ?? Future.value(mode);

  @override
  Future<void> save(ThemeMode value) async {
    writes.add(value);
    await onSave?.call(value);
    mode = value;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'storage round trips every mode and defaults invalid values to System',
    () async {
      for (final value in [
        null,
        'unknown',
        ...ThemeMode.values.map((m) => m.name),
      ]) {
        FlutterSecureStorage.setMockInitialValues({
          if (value != null) SecureThemeModeStorage.key: value,
        });
        const storage = SecureThemeModeStorage();
        final expected = switch (value) {
          'light' => ThemeMode.light,
          'dark' => ThemeMode.dark,
          _ => ThemeMode.system,
        };
        expect(await storage.load(), expected);
        for (final mode in ThemeMode.values) {
          await storage.save(mode);
          expect(await storage.load(), mode);
        }
      }
    },
  );

  test('provider restores a saved choice and persists changes', () async {
    final storage = _Storage()..mode = ThemeMode.dark;
    final container = ProviderContainer(
      overrides: [themeModeStorageProvider.overrideWithValue(storage)],
    );
    addTearDown(container.dispose);
    final controller = container.read(themeModeProvider.notifier);
    await controller.ready;
    expect(container.read(themeModeProvider), ThemeMode.dark);
    expect(await controller.setThemeMode(ThemeMode.light), isTrue);
    expect(container.read(themeModeProvider), ThemeMode.light);
    expect(storage.mode, ThemeMode.light);
  });

  test('a user choice wins over a late initial restore', () async {
    final initial = Completer<ThemeMode>();
    final storage = _Storage()..onLoad = () => initial.future;
    final controller = ThemeModeController(storage);
    addTearDown(controller.dispose);
    await controller.setThemeMode(ThemeMode.light);
    initial.complete(ThemeMode.dark);
    await controller.ready;
    expect(controller.state, ThemeMode.light);
    expect(storage.mode, ThemeMode.light);
  });

  test(
    'rapid choices save in order and the newest remains effective',
    () async {
      final firstWrite = Completer<void>();
      final storage = _Storage()
        ..onSave = (mode) async {
          if (mode == ThemeMode.dark) await firstWrite.future;
        };
      final controller = ThemeModeController(storage);
      addTearDown(controller.dispose);
      await controller.ready;
      final first = controller.setThemeMode(ThemeMode.dark);
      final second = controller.setThemeMode(ThemeMode.light);
      final third = controller.setThemeMode(ThemeMode.system);
      await Future<void>.delayed(Duration.zero);
      expect(controller.state, ThemeMode.system);
      expect(storage.writes, [ThemeMode.dark]);
      firstWrite.complete();
      expect(await Future.wait([first, second, third]), [true, true, true]);
      expect(storage.writes, [
        ThemeMode.dark,
        ThemeMode.light,
        ThemeMode.system,
      ]);
      expect(storage.mode, ThemeMode.system);
    },
  );

  test(
    'storage failure retains session choice and later saves can recover',
    () async {
      final storage = _Storage()
        ..onLoad = () async {
          throw StateError('Unavailable storage');
        }
        ..onSave = (_) async => throw StateError('Unavailable storage');
      final controller = ThemeModeController(storage);
      addTearDown(controller.dispose);
      await controller.ready;
      expect(controller.state, ThemeMode.system);
      expect(await controller.setThemeMode(ThemeMode.light), isFalse);
      expect(controller.state, ThemeMode.light);
      storage.onSave = null;
      expect(await controller.setThemeMode(ThemeMode.dark), isTrue);
      expect(storage.mode, ThemeMode.dark);
    },
  );

  test('disposing during restore does not update disposed state', () async {
    final initial = Completer<ThemeMode>();
    final controller = ThemeModeController(
      _Storage()..onLoad = () => initial.future,
    );
    controller.dispose();
    initial.complete(ThemeMode.dark);
    await expectLater(controller.ready, completes);
    expect(await controller.setThemeMode(ThemeMode.light), isFalse);
  });

  testWidgets(
    'System follows platform brightness; explicit choices override it',
    (tester) async {
      final container = ProviderContainer(
        overrides: [themeModeStorageProvider.overrideWithValue(_Storage())],
      );
      addTearDown(container.dispose);
      final dispatcher = tester.binding.platformDispatcher;
      addTearDown(dispatcher.clearPlatformBrightnessTestValue);
      dispatcher.platformBrightnessTestValue = Brightness.light;
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: Consumer(
            builder: (context, ref, _) {
              return MaterialApp(
                theme: LythausTheme.light(),
                darkTheme: LythausTheme.dark(),
                themeMode: ref.watch(themeModeProvider),
                home: Builder(
                  builder: (context) {
                    return Text(Theme.of(context).brightness.name);
                  },
                ),
              );
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('light'), findsOneWidget);
      dispatcher.platformBrightnessTestValue = Brightness.dark;
      await tester.pumpAndSettle();
      expect(find.text('dark'), findsOneWidget);
      final controller = container.read(themeModeProvider.notifier);
      await controller.setThemeMode(ThemeMode.light);
      await tester.pumpAndSettle();
      expect(find.text('light'), findsOneWidget);
      await controller.setThemeMode(ThemeMode.dark);
      dispatcher.platformBrightnessTestValue = Brightness.light;
      await tester.pumpAndSettle();
      expect(find.text('dark'), findsOneWidget);
      await controller.setThemeMode(ThemeMode.system);
      await tester.pumpAndSettle();
      expect(find.text('light'), findsOneWidget);
    },
  );
}
