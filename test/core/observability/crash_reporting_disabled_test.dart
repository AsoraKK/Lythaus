/// Additional coverage tests for FirebaseCrashSink disabled paths.
///
/// FirebaseCrashSink._enabled is false on non-Android platforms,
/// making the early-return paths in recordFlutterError/recordError testable.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/observability/crash_reporting.dart';

void main() {
  // ── FirebaseCrashSink disabled-path (non-Android) ─────────────────────────
  group('FirebaseCrashSink (non-Android, disabled)', () {
    late TargetPlatform? previousPlatform;

    setUp(() {
      previousPlatform = debugDefaultTargetPlatformOverride;
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    });

    tearDown(() {
      debugDefaultTargetPlatformOverride = previousPlatform;
    });

    test('initialize sets _enabled=false on iOS and does not throw', () async {
      final sink = FirebaseCrashSink();
      await expectLater(sink.initialize(), completes);
    });

    test('recordFlutterError is no-op when _enabled=false', () async {
      final sink = FirebaseCrashSink();
      await sink.initialize(); // _enabled becomes false on iOS
      const details = FlutterErrorDetails(exception: 'ignored');
      // Should complete without throwing or touching real Firebase
      await expectLater(
        sink.recordFlutterError(details, fatal: false),
        completes,
      );
    });

    test(
      'recordFlutterError fatal=true is no-op when _enabled=false',
      () async {
        final sink = FirebaseCrashSink();
        await sink.initialize();
        const details = FlutterErrorDetails(exception: 'ignored');
        await expectLater(
          sink.recordFlutterError(details, fatal: true),
          completes,
        );
      },
    );

    test('recordError is no-op when _enabled=false', () async {
      final sink = FirebaseCrashSink();
      await sink.initialize();
      await expectLater(
        sink.recordError(
          StateError('ignored'),
          StackTrace.current,
          fatal: false,
        ),
        completes,
      );
    });

    test('recordError fatal=true is no-op when _enabled=false', () async {
      final sink = FirebaseCrashSink();
      await sink.initialize();
      await expectLater(
        sink.recordError(
          StateError('ignored'),
          StackTrace.current,
          fatal: true,
        ),
        completes,
      );
    });

    test(
      'recordFlutterError before initialize is no-op (_enabled starts false)',
      () async {
        final sink = FirebaseCrashSink();
        // Do NOT call initialize — _enabled defaults to false
        const details = FlutterErrorDetails(exception: 'pre-init');
        await expectLater(
          sink.recordFlutterError(details, fatal: false),
          completes,
        );
      },
    );

    test('recordError before initialize is no-op', () async {
      final sink = FirebaseCrashSink();
      await expectLater(
        sink.recordError(
          StateError('pre-init'),
          StackTrace.current,
          fatal: false,
        ),
        completes,
      );
    });
  });

  // ── enableInDebug flag ────────────────────────────────────────────────────
  group('FirebaseCrashSink.enableInDebug', () {
    test('can be constructed with enableInDebug=true', () {
      final sink = FirebaseCrashSink(enableInDebug: true);
      expect(sink.enableInDebug, isTrue);
    });

    test('default enableInDebug is false', () {
      final sink = FirebaseCrashSink();
      expect(sink.enableInDebug, isFalse);
    });
  });
}
