import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/index.dart';
import 'package:lythaus/design_system/components/lyth_list_row.dart';
import 'package:lythaus/design_system/components/lyth_skeleton.dart';

void main() {
  test(
    'Flutter colors remain aligned with the platform-neutral token source',
    () {
      final source =
          jsonDecode(File('design/tokens.json').readAsStringSync())
              as Map<String, dynamic>;
      for (final entry in {
        'light': LythSemanticColors.light,
        'dark': LythSemanticColors.dark,
      }.entries) {
        final expected = source['color'][entry.key] as Map<String, dynamic>;
        expect(entry.value.keys, unorderedEquals(expected.keys));
        for (final color in entry.value.entries) {
          final hex =
              '#${color.value.toARGB32().toRadixString(16).substring(2).toUpperCase()}';
          expect(hex, expected[color.key], reason: '${entry.key}.${color.key}');
        }
      }
      expect(LythRadius.button, source['radius']['control']);
      expect(LythRadius.card, source['radius']['surface']);
      expect(LythRadius.dialog, source['radius']['dialog']);
      expect(LythSpacing.minTapTarget, source['layout']['flutterTarget']);
      expect(
        LythausTheme.light().textTheme.bodyLarge?.fontFamily,
        source['typography']['flutterBody'],
      );
    },
  );

  test('contrast uses sRGB exponent 2.4 and composites alpha', () {
    expect(
      LythColorSchemes.contrastRatio(const Color(0xFF777777), Colors.white),
      closeTo(4.478089, 0.00001),
    );
    expect(
      LythColorSchemes.contrastRatio(const Color(0xFF767676), Colors.white),
      greaterThan(4.5),
    );
    expect(
      LythColorSchemes.contrastRatio(
        Colors.black.withValues(alpha: 0.5),
        Colors.white,
      ),
      closeTo(4, 0.05),
    );
    expect(
      () => LythColorSchemes.contrastRatio(Colors.black, Colors.transparent),
      throwsArgumentError,
    );
  });

  for (final appearance in ['light', 'dark']) {
    final colors = appearance == 'light'
        ? LythSemanticColors.light
        : LythSemanticColors.dark;
    final theme = appearance == 'light'
        ? LythausTheme.light()
        : LythausTheme.dark();

    test(
      '$appearance composited reading, action, control and feedback contrast',
      () {
        for (final background in ['canvas', 'surface', 'surfaceRaised']) {
          for (final foreground in ['text', 'secondary', 'muted', 'accent']) {
            expect(
              LythColorSchemes.contrastRatio(
                colors[foreground]!,
                colors[background]!,
              ),
              greaterThanOrEqualTo(4.5),
              reason: '$appearance $foreground on $background',
            );
          }
          for (final boundary in ['control', 'focus']) {
            expect(
              LythColorSchemes.contrastRatio(
                colors[boundary]!,
                colors[background]!,
              ),
              greaterThanOrEqualTo(3),
              reason: '$appearance $boundary on $background',
            );
          }
        }
        for (final pair in [
          ['onAccent', 'accent'],
          ['onSelection', 'selection'],
          ['onDanger', 'danger'],
          ['danger', 'dangerSurface'],
          ['success', 'successSurface'],
          ['warning', 'warningSurface'],
          ['info', 'infoSurface'],
        ]) {
          expect(
            LythColorSchemes.contrastRatio(colors[pair[0]]!, colors[pair[1]]!),
            greaterThanOrEqualTo(4.5),
            reason: '$appearance ${pair.join(' on ')}',
          );
        }
      },
    );

    testWidgets(
      '$appearance long controls reflow at 320 pixels and 200% text',
      (tester) async {
        tester.view.physicalSize = const Size(320, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: child!,
            ),
            home: Scaffold(
              body: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    LythButton.primary(
                      label: 'Review your account security settings',
                      icon: Icons.security,
                      onPressed: () {},
                    ),
                    const SizedBox(height: 24),
                    const LythTextInput(
                      label: 'Email address',
                      errorText:
                          'Enter the complete email address to continue.',
                    ),
                    const SizedBox(height: 24),
                    const LythListRow(
                      title: 'Account security and sign-in options',
                      subtitle:
                          'Choose the account settings that work for you.',
                      leadingIcon: Icons.lock_outline,
                      selected: true,
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(
          tester.getSize(find.byType(ElevatedButton)).height,
          greaterThanOrEqualTo(48),
        );
        expect(tester.getSize(find.byType(TextField)).height, greaterThan(48));
        expect(
          tester.getSize(find.byType(LythListRow)).height,
          greaterThan(60),
        );
      },
    );

    testWidgets(
      '$appearance loading buttons preserve geometry and reduced motion',
      (tester) async {
        Widget build(bool loading) => MaterialApp(
          theme: theme,
          home: MediaQuery(
            data: const MediaQueryData(disableAnimations: true),
            child: Scaffold(
              body: Center(
                child: LythButton(
                  label: 'Save account preferences',
                  icon: Icons.check,
                  onPressed: () {},
                  isLoading: loading,
                ),
              ),
            ),
          ),
        );
        await tester.pumpWidget(build(false));
        final idle = tester.getSize(find.byType(ElevatedButton));
        await tester.pumpWidget(build(true));
        await tester.pumpAndSettle();
        expect(tester.getSize(find.byType(ElevatedButton)), idle);
        expect(
          tester.widget<ElevatedButton>(find.byType(ElevatedButton)).onPressed,
          isNull,
        );
        expect(
          tester
              .widget<CircularProgressIndicator>(
                find.byType(CircularProgressIndicator),
              )
              .value,
          0.75,
        );
      },
    );
  }

  testWidgets(
    'password visibility is named, reversible and preserves the value',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: LythausTheme.light(),
          home: Scaffold(
            body: LythTextInput.password(label: 'Password', onChanged: (_) {}),
          ),
        ),
      );
      await tester.enterText(find.byType(TextField), 'a private test password');
      await tester.tap(find.byTooltip('Show password'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).obscureText,
        isFalse,
      );
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        'a private test password',
      );
      await tester.tap(find.byTooltip('Hide password'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).obscureText,
        isTrue,
      );
    },
  );

  testWidgets('skeleton reacts when reduced motion preference changes', (
    tester,
  ) async {
    Widget build(bool reduced) => MaterialApp(
      theme: LythausTheme.dark(),
      home: MediaQuery(
        data: MediaQueryData(disableAnimations: reduced),
        child: const Scaffold(body: LythSkeleton.line(height: 16)),
      ),
    );
    await tester.pumpWidget(build(true));
    await tester.pumpAndSettle();
    expect(tester.binding.hasScheduledFrame, isFalse);
    await tester.pumpWidget(build(false));
    await tester.pump(const Duration(milliseconds: 100));
    expect(tester.binding.hasScheduledFrame, isTrue);
    await tester.pumpWidget(build(true));
    await tester.pumpAndSettle();
    expect(tester.binding.hasScheduledFrame, isFalse);
  });
}
