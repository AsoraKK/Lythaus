// ignore_for_file: public_member_api_docs

/// LYTHAUS HTTP ANALYTICS CLIENT
///
/// 🎯 Purpose: Transport layer for analytics events to backend
/// 🔐 Privacy: Batches events, sends to /api/analytics/events
/// 📊 Performance: Local queuing, periodic flush, resilient to failures
library;

import 'dart:async';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'package:lythaus/core/analytics/analytics_client.dart';

/// Analytics event model for batching
class _AnalyticsEvent {
  const _AnalyticsEvent({
    required this.name,
    required this.timestamp,
    this.properties,
  });

  final String name;
  final DateTime timestamp;
  final Map<String, Object?>? properties;

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'ts': timestamp.toIso8601String(),
      if (properties != null && properties!.isNotEmpty) 'props': properties,
    };
  }
}

/// HTTP-based analytics client that batches and sends events to backend.
///
/// Features:
/// - Local event queue with periodic flushing
/// - Resilient to network failures (drop events on persistent failure)
/// - Automatic flush on app background
/// - Pseudonymous session IDs
///
/// Note: Not immutable as it maintains mutable state for event queuing.
// ignore: must_be_immutable
class HttpAnalyticsClient implements AnalyticsClient {
  HttpAnalyticsClient({
    required Dio dio,
    String appVersion = '1.0.0',
    String platform = 'mobile',
    Duration flushInterval = const Duration(seconds: 30),
    int flushThreshold = 20,
  }) : _dio = dio,
       _appVersion = appVersion,
       _platform = platform,
       _flushInterval = flushInterval,
       _flushThreshold = flushThreshold {
    _startFlushTimer();
  }

  final Dio _dio;
  final String _appVersion;
  final String _platform;
  final Duration _flushInterval;
  final int _flushThreshold;

  final List<_AnalyticsEvent> _eventQueue = [];
  String? _userId;
  String _sessionId = _generateSessionId();
  Timer? _flushTimer;
  bool _isFlushing = false;

  static bool _isSensitiveTelemetryKey(String key) {
    final normalized = key.toLowerCase();
    if (normalized == 'event_id' ||
        normalized == 'receipt_event_id' ||
        normalized == 'receipt_event_ids') {
      return true;
    }
    if ((normalized.contains('capture') || normalized.contains('edit')) &&
        normalized.contains('hash')) {
      return true;
    }
    if (normalized.contains('proof') && normalized.contains('hash')) {
      return true;
    }
    if (normalized.contains('attestation') && normalized.contains('url')) {
      return true;
    }
    return false;
  }

  static Map<String, Object?>? _sanitizeProperties(
    Map<String, Object?>? properties,
  ) {
    if (properties == null || properties.isEmpty) {
      return properties;
    }

    final sanitized = <String, Object?>{};
    for (final entry in properties.entries) {
      if (_isSensitiveTelemetryKey(entry.key)) {
        continue;
      }
      sanitized[entry.key] = entry.value;
    }
    return sanitized;
  }

  /// Generate a random session ID (simple UUID v4 alternative)
  static String _generateSessionId() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  @override
  Future<void> logEvent(String name, {Map<String, Object?>? properties}) async {
    // Validate event name (snake_case, alphanumeric + underscore)
    if (!RegExp(r'^[a-z0-9_]+$').hasMatch(name)) {
      debugPrint('⚠️ Analytics: Invalid event name: $name');
      return;
    }

    final sanitizedProperties = _sanitizeProperties(properties);

    // Validate properties (max 20 keys, scalar values only)
    if (sanitizedProperties != null) {
      if (sanitizedProperties.length > 20) {
        debugPrint(
          '⚠️ Analytics: Too many properties (${sanitizedProperties.length}) for event: $name',
        );
        return;
      }

      for (final entry in sanitizedProperties.entries) {
        final value = entry.value;
        if (value != null &&
            value is! String &&
            value is! num &&
            value is! bool &&
            value is! List) {
          debugPrint(
            '⚠️ Analytics: Invalid property type for ${entry.key}: ${value.runtimeType}',
          );
          return;
        }
      }
    }

    _eventQueue.add(
      _AnalyticsEvent(
        name: name,
        timestamp: DateTime.now(),
        properties: sanitizedProperties,
      ),
    );

    // Flush if threshold reached
    if (_eventQueue.length >= _flushThreshold) {
      unawaited(_flush());
    }
  }

  @override
  Future<void> setUserId(String? userId) async {
    _userId = userId;
  }

  @override
  Future<void> setUserProperties(Map<String, Object?> properties) async {
    // User properties could be sent as a special event or separate endpoint
    // For simplicity, log as a special event
    await logEvent('_user_properties_updated', properties: properties);
  }

  @override
  Future<void> reset() async {
    await _flush(); // Flush pending events before reset
    _userId = null;
    _sessionId = _generateSessionId(); // New session on reset
    _eventQueue.clear();
  }

  /// Manually flush events to backend (for testing or app background)
  Future<void> flush() => _flush();

  /// Flush events to backend
  Future<void> _flush() async {
    if (_eventQueue.isEmpty || _isFlushing) return;

    _isFlushing = true;
    final eventsToSend = List<_AnalyticsEvent>.from(_eventQueue);
    _eventQueue.clear();

    try {
      final payload = {
        'userId': _userId,
        'sessionId': _sessionId,
        'events': eventsToSend.map((e) => e.toJson()).toList(),
        'app': {'version': _appVersion, 'platform': _platform},
      };

      await _dio.post<Map<String, dynamic>>(
        '/api/analytics/events',
        data: payload,
        options: Options(
          sendTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );

      debugPrint('✅ Analytics: Flushed ${eventsToSend.length} events');
    } on DioException catch (e) {
      debugPrint('⚠️ Analytics: Failed to flush events: ${e.message}');
      // Drop events on failure to avoid infinite retry and memory buildup
      // In production, could implement limited retry with backoff
    } catch (e) {
      debugPrint('⚠️ Analytics: Unexpected error flushing events: $e');
    } finally {
      _isFlushing = false;
    }
  }

  /// Start periodic flush timer
  void _startFlushTimer() {
    _flushTimer?.cancel();
    _flushTimer = Timer.periodic(_flushInterval, (_) => _flush());
  }

  /// Dispose resources
  Future<void> dispose() async {
    _flushTimer?.cancel();
    await _flush(); // Final flush on dispose
  }
}
