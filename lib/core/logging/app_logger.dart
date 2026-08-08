// ignore_for_file: public_member_api_docs

// LYTHAUS APP LOGGER
//
// 🎯 Purpose: Centralized logging for debugging and telemetry
// 📊 Telemetry: Structured logging with levels and context
// 📱 Platform: Flutter with Riverpod provider integration

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Log levels for filtering and display
enum LogLevel { debug, info, warning, error }

/// Simple app logger with structured output
class AppLogger {
  final String _tag;

  AppLogger([this._tag = 'Lythaus']);

  /// Log debug message (only in debug mode)
  void debug(String message, [Object? error, StackTrace? stackTrace]) {
    if (kDebugMode) {
      _log(LogLevel.debug, message, error, stackTrace);
    }
  }

  /// Log info message
  void info(String message, [Object? error, StackTrace? stackTrace]) {
    _log(LogLevel.info, message, error, stackTrace);
  }

  /// Log warning message
  void warning(String message, [Object? error, StackTrace? stackTrace]) {
    _log(LogLevel.warning, message, error, stackTrace);
  }

  /// Log error message
  void error(String message, [Object? error, StackTrace? stackTrace]) {
    _log(LogLevel.error, message, error, stackTrace);
  }

  /// Internal logging implementation
  void _log(
    LogLevel level,
    String message, [
    Object? error,
    StackTrace? stackTrace,
  ]) {
    final timestamp = DateTime.now().toIso8601String();
    final levelName = level.name.toUpperCase().padRight(7);
    final tag = _tag.padRight(10);

    final logMessage = '[$timestamp] $levelName [$tag] $message';

    // Use appropriate print method based on level
    switch (level) {
      case LogLevel.debug:
      case LogLevel.info:
        debugPrint(logMessage);
        break;
      case LogLevel.warning:
      case LogLevel.error:
        debugPrint(logMessage);
        break;
    }

    // Print error details if provided
    if (error != null) {
      debugPrint('  Error: $error');
    }
    if (stackTrace != null) {
      debugPrint(
        '  Stack: ${stackTrace.toString().split('\n').take(5).join('\n  ')}',
      );
    }
  }
}

/// Global app logger provider
final appLoggerProvider = Provider<AppLogger>((ref) => AppLogger());
