// ignore_for_file: public_member_api_docs

import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';

import 'package:lythaus/core/logging/app_logger.dart';

abstract class CrashSink {
  Future<void> initialize();
  Future<void> recordFlutterError(
    FlutterErrorDetails details, {
    required bool fatal,
  });
  Future<void> recordError(
    Object error,
    StackTrace stackTrace, {
    required bool fatal,
  });
}

class FirebaseCrashSink implements CrashSink {
  FirebaseCrashSink({
    FirebaseCrashlytics? crashlytics,
    this.enableInDebug = false,
  }) : _crashlytics = crashlytics;

  FirebaseCrashlytics? _crashlytics;
  final bool enableInDebug;
  bool _enabled = false;

  @override
  Future<void> initialize() async {
    final isAndroid =
        !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
    if (!isAndroid) {
      _enabled = false;
      return;
    }

    await Firebase.initializeApp();
    _crashlytics ??= FirebaseCrashlytics.instance;
    _enabled = !kDebugMode || enableInDebug;
    await _crashlytics!.setCrashlyticsCollectionEnabled(_enabled);
  }

  @override
  Future<void> recordFlutterError(
    FlutterErrorDetails details, {
    required bool fatal,
  }) async {
    if (!_enabled) return;
    final crashlytics = _crashlytics;
    if (crashlytics == null) return;
    if (fatal) {
      await crashlytics.recordFlutterFatalError(details);
    } else {
      await crashlytics.recordFlutterError(details);
    }
  }

  @override
  Future<void> recordError(
    Object error,
    StackTrace stackTrace, {
    required bool fatal,
  }) async {
    if (!_enabled) return;
    final crashlytics = _crashlytics;
    if (crashlytics == null) return;
    await crashlytics.recordError(error, stackTrace, fatal: fatal);
  }
}

class CrashReportingService {
  CrashReportingService({required CrashSink sink, required AppLogger logger})
    : _sink = sink,
      _logger = logger;

  final CrashSink _sink;
  final AppLogger _logger;

  Future<void> initialize() async {
    try {
      await _sink.initialize();
    } catch (error, stackTrace) {
      _logger.warning('crash_reporting_init_failed', error, stackTrace);
      return;
    }

    final previousFlutterErrorHandler = FlutterError.onError;

    FlutterError.onError = (FlutterErrorDetails details) {
      if (previousFlutterErrorHandler != null) {
        previousFlutterErrorHandler(details);
      } else {
        FlutterError.presentError(details);
      }

      unawaited(_sink.recordFlutterError(details, fatal: true));
    };

    PlatformDispatcher.instance.onError = (Object error, StackTrace stack) {
      unawaited(_sink.recordError(error, stack, fatal: true));
      return true;
    };
  }
}
