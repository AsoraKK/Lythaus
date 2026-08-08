import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/core/observability/crash_reporting.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeCrashSink implements CrashSink {
  int initializeCalls = 0;
  int flutterErrors = 0;
  int runtimeErrors = 0;

  @override
  Future<void> initialize() async {
    initializeCalls++;
  }

  @override
  Future<void> recordFlutterError(
    FlutterErrorDetails details, {
    required bool fatal,
  }) async {
    flutterErrors++;
  }

  @override
  Future<void> recordError(
    Object error,
    StackTrace stackTrace, {
    required bool fatal,
  }) async {
    runtimeErrors++;
  }
}

class _ThrowingCrashSink implements CrashSink {
  @override
  Future<void> initialize() async {
    throw StateError('init failed');
  }

  @override
  Future<void> recordFlutterError(
    FlutterErrorDetails details, {
    required bool fatal,
  }) async {}

  @override
  Future<void> recordError(
    Object error,
    StackTrace stackTrace, {
    required bool fatal,
  }) async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('FirebaseCrashSink is safe to construct off Android', () async {
    final previousPlatform = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    try {
      final sink = FirebaseCrashSink();
      await expectLater(sink.initialize(), completes);
    } finally {
      debugDefaultTargetPlatformOverride = previousPlatform;
    }
  });

  test('initialization installs Flutter and runtime handlers', () async {
    final sink = _FakeCrashSink();
    final service = CrashReportingService(
      sink: sink,
      logger: AppLogger('TestCrash'),
    );

    await service.initialize();
    expect(sink.initializeCalls, 1);
    expect(FlutterError.onError, isNotNull);
    expect(PlatformDispatcher.instance.onError, isNotNull);

    final details = FlutterErrorDetails(
      exception: StateError('flutter-failure'),
      stack: StackTrace.current,
    );
    FlutterError.onError!(details);
    await Future<void>.delayed(Duration.zero);
    expect(sink.flutterErrors, 1);

    final runtimeHandler = PlatformDispatcher.instance.onError!;
    final handled = runtimeHandler(
      StateError('runtime-failure'),
      StackTrace.current,
    );
    expect(handled, isTrue);
    await Future<void>.delayed(Duration.zero);
    expect(sink.runtimeErrors, 1);
  });

  test('initialization does not throw when sink init fails', () async {
    final service = CrashReportingService(
      sink: _ThrowingCrashSink(),
      logger: AppLogger('TestCrash'),
    );

    await expectLater(service.initialize(), completes);
  });
}
