import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/logging/app_logger.dart';

void main() {
  group('AppLogger', () {
    late AppLogger logger;
    late List<String> debugPrints;

    setUp(() {
      logger = AppLogger('TestTag');
      debugPrints = [];
      // Capture debugPrint calls
      debugPrint = (String? message, {int? wrapWidth}) {
        if (message != null) debugPrints.add(message);
      };
    });

    tearDown(() {
      debugPrint = debugPrintSynchronously;
    });

    test('creates logger with default tag', () {
      final defaultLogger = AppLogger();
      expect(defaultLogger, isA<AppLogger>());
    });

    test('creates logger with custom tag', () {
      final customLogger = AppLogger('Custom');
      expect(customLogger, isA<AppLogger>());
    });

    group('debug', () {
      test('logs debug message in debug mode', () {
        logger.debug('Debug message');

        expect(debugPrints.length, greaterThan(0));
        final output = debugPrints.join('\n');
        expect(output, contains('DEBUG'));
        expect(output, contains('TestTag'));
        expect(output, contains('Debug message'));
      });

      test('includes error details when provided', () {
        final error = Exception('Test error');
        logger.debug('Debug with error', error);

        final output = debugPrints.join('\n');
        expect(output, contains('Error:'));
        expect(output, contains('Test error'));
      });

      test('includes stack trace when provided', () {
        final stackTrace = StackTrace.current;
        logger.debug('Debug with stack', null, stackTrace);

        final output = debugPrints.join('\n');
        expect(output, contains('Stack:'));
      });
    });

    group('info', () {
      test('logs info message', () {
        logger.info('Info message');

        expect(debugPrints.length, greaterThan(0));
        final output = debugPrints.join('\n');
        expect(output, contains('INFO'));
        expect(output, contains('TestTag'));
        expect(output, contains('Info message'));
      });

      test('includes error and stack trace', () {
        final error = Exception('Info error');
        final stackTrace = StackTrace.current;
        logger.info('Info with details', error, stackTrace);

        final output = debugPrints.join('\n');
        expect(output, contains('Info error'));
        expect(output, contains('Stack:'));
      });
    });

    group('warning', () {
      test('logs warning message', () {
        logger.warning('Warning message');

        expect(debugPrints.length, greaterThan(0));
        final output = debugPrints.join('\n');
        expect(output, contains('WARNING'));
        expect(output, contains('TestTag'));
        expect(output, contains('Warning message'));
      });

      test('includes error when provided', () {
        final error = ArgumentError('Bad argument');
        logger.warning('Warning with error', error);

        final output = debugPrints.join('\n');
        expect(output, contains('Bad argument'));
      });
    });

    group('error', () {
      test('logs error message', () {
        logger.error('Error message');

        expect(debugPrints.length, greaterThan(0));
        final output = debugPrints.join('\n');
        expect(output, contains('ERROR'));
        expect(output, contains('TestTag'));
        expect(output, contains('Error message'));
      });

      test('includes full error and stack trace details', () {
        final error = StateError('Bad state');
        final stackTrace = StackTrace.current;
        logger.error('Critical error', error, stackTrace);

        final output = debugPrints.join('\n');
        expect(output, contains('Bad state'));
        expect(output, contains('Stack:'));
      });
    });

    group('LogLevel enum', () {
      test('has expected values', () {
        expect(LogLevel.values, hasLength(4));
        expect(LogLevel.values, contains(LogLevel.debug));
        expect(LogLevel.values, contains(LogLevel.info));
        expect(LogLevel.values, contains(LogLevel.warning));
        expect(LogLevel.values, contains(LogLevel.error));
      });
    });
  });

  group('appLoggerProvider', () {
    test('provides AppLogger instance', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final logger = container.read(appLoggerProvider);
      expect(logger, isA<AppLogger>());
    });

    test('provides same instance on multiple reads', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final logger1 = container.read(appLoggerProvider);
      final logger2 = container.read(appLoggerProvider);
      expect(identical(logger1, logger2), isTrue);
    });
  });
}
