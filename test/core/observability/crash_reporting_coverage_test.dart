import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/observability/crash_reporting.dart';
import 'package:lythaus/core/logging/app_logger.dart';
import 'package:flutter/foundation.dart';

/// A mock CrashSink that records calls.
class _MockCrashSink implements CrashSink {
  bool initializeCalled = false;
  bool throwOnInit = false;
  final List<Map<String, dynamic>> recordedErrors = [];
  final List<Map<String, dynamic>> recordedFlutterErrors = [];

  @override
  Future<void> initialize() async {
    if (throwOnInit) throw StateError('init failed');
    initializeCalled = true;
  }

  @override
  Future<void> recordFlutterError(
    FlutterErrorDetails details, {
    required bool fatal,
  }) async {
    recordedFlutterErrors.add({'details': details, 'fatal': fatal});
  }

  @override
  Future<void> recordError(
    Object error,
    StackTrace stackTrace, {
    required bool fatal,
  }) async {
    recordedErrors.add({
      'error': error,
      'stackTrace': stackTrace,
      'fatal': fatal,
    });
  }
}

/// A mock AppLogger that records calls.
class _MockLogger implements AppLogger {
  final warnings = <String>[];

  @override
  void warning(String message, [Object? error, StackTrace? stackTrace]) {
    warnings.add(message);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  // ─── CrashReportingService ───
  group('CrashReportingService', () {
    test('initialize calls sink.initialize', () async {
      final sink = _MockCrashSink();
      final logger = _MockLogger();
      final service = CrashReportingService(sink: sink, logger: logger);

      await service.initialize();
      expect(sink.initializeCalled, isTrue);
    });

    test('initialize catches sink init error and logs warning', () async {
      final sink = _MockCrashSink()..throwOnInit = true;
      final logger = _MockLogger();
      final service = CrashReportingService(sink: sink, logger: logger);

      await service.initialize();
      expect(logger.warnings, contains('crash_reporting_init_failed'));
    });

    test('initialize installs FlutterError.onError handler', () async {
      final sink = _MockCrashSink();
      final logger = _MockLogger();
      final service = CrashReportingService(sink: sink, logger: logger);

      final originalHandler = FlutterError.onError;
      try {
        await service.initialize();
        expect(FlutterError.onError, isNotNull);
        // Trigger the handler
        final details = FlutterErrorDetails(exception: Exception('test'));
        FlutterError.onError!(details);

        // Wait for microtask
        await Future<void>.delayed(Duration.zero);
        expect(sink.recordedFlutterErrors, hasLength(1));
        expect(sink.recordedFlutterErrors.first['fatal'], isTrue);
      } finally {
        FlutterError.onError = originalHandler;
      }
    });

    test('initialize installs PlatformDispatcher.onError handler', () async {
      final sink = _MockCrashSink();
      final logger = _MockLogger();
      final service = CrashReportingService(sink: sink, logger: logger);

      final originalHandler = PlatformDispatcher.instance.onError;
      try {
        await service.initialize();
        expect(PlatformDispatcher.instance.onError, isNotNull);

        // Trigger the handler
        final result = PlatformDispatcher.instance.onError!(
          Exception('platform'),
          StackTrace.current,
        );
        expect(result, isTrue);

        // Wait for microtask
        await Future<void>.delayed(Duration.zero);
        expect(sink.recordedErrors, hasLength(1));
        expect(sink.recordedErrors.first['fatal'], isTrue);
      } finally {
        PlatformDispatcher.instance.onError = originalHandler;
      }
    });
  });

  // ─── CrashSink interface ───
  group('CrashSink mock', () {
    test('recordError stores error info', () async {
      final sink = _MockCrashSink();
      final err = Exception('boom');
      final stack = StackTrace.current;
      await sink.recordError(err, stack, fatal: false);
      expect(sink.recordedErrors.first['error'], err);
      expect(sink.recordedErrors.first['fatal'], isFalse);
    });

    test('recordFlutterError stores details', () async {
      final sink = _MockCrashSink();
      const details = FlutterErrorDetails(exception: 'err');
      await sink.recordFlutterError(details, fatal: true);
      expect(sink.recordedFlutterErrors.first['fatal'], isTrue);
    });
  });
}
