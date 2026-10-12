// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';

const activityNoticeVersion = 'activity-account-day-v1';
const activityMeasurementNotice =
    'Optional account-linked activity measurement: when you choose to take part, Lythaus records one active UTC date for your account when the app renders visibly in the foreground, including an empty feed. We use these dates to measure activity and quiet accounts within the consenting cohort. We do not record browsed URLs, viewed content or browsing history for this purpose. Activity dates stop contributing to metrics after 61 days and are removed by scheduled cleanup. You can withdraw here at any time; withdrawal stops collection and removes these dates unless an existing legal hold requires preservation. Held dates are excluded from these metrics. Your consent decisions remain in the existing account consent record and are included in your data export.';

class ActivityMeasurementFailure implements Exception {
  const ActivityMeasurementFailure(this.code);
  final String code;
}

class ActivityConsentRecord {
  const ActivityConsentRecord({
    required this.pilotEnabled,
    required this.granted,
    required this.revision,
    required this.epoch,
    required this.accountScope,
  });
  final bool pilotEnabled;
  final bool granted;
  final int revision;
  final String? epoch;
  final String accountScope;

  factory ActivityConsentRecord.fromJson(Map<String, dynamic> value) {
    final revision = value['revision'];
    final epoch = value['epoch'];
    final scope = value['accountScope'];
    if (value['noticeVersion'] != activityNoticeVersion ||
        value['notice'] != activityMeasurementNotice ||
        value['retentionDays'] != 61 ||
        value['pilotEnabled'] is! bool ||
        value['granted'] is! bool ||
        revision is! int ||
        revision < 0 ||
        revision > 9007199254740991 ||
        (revision == 0
            ? epoch != null || value['granted'] == true
            : epoch is! String ||
                  !RegExp(
                    r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
                    caseSensitive: false,
                  ).hasMatch(epoch)) ||
        scope is! String ||
        !RegExp(r'^[A-Za-z0-9+/]{43}=$').hasMatch(scope)) {
      throw const ActivityMeasurementFailure('source_unavailable');
    }
    return ActivityConsentRecord(
      pilotEnabled: value['pilotEnabled'] as bool,
      granted: value['granted'] as bool,
      revision: revision,
      epoch: epoch as String?,
      accountScope: scope,
    );
  }
}

abstract class ActivityMeasurementClient {
  Future<ActivityConsentRecord> status();
  Future<ActivityConsentRecord> setConsent(
    ActivityConsentRecord current, {
    required bool enabled,
  });
  Future<String> recordForegroundRender(ActivityConsentRecord current);
  void cancelRenders();
  void cancelPending();
}

class DioActivityMeasurementClient implements ActivityMeasurementClient {
  DioActivityMeasurementClient({
    required Dio dio,
    required bool Function() isCurrentSession,
    required Future<String?> Function() readAuthToken,
  }) : _dio = dio,
       _isCurrentSession = isCurrentSession,
       _readAuthToken = readAuthToken;

  final Dio _dio;
  final bool Function() _isCurrentSession;
  final Future<String?> Function() _readAuthToken;
  final _pending = <CancelToken>{};
  final _renders = <CancelToken>{};
  bool _cancelled = false;

  Future<Map<String, dynamic>> _request(
    String path,
    String method, {
    Map<String, dynamic>? body,
    bool render = false,
  }) async {
    if (_cancelled || !_isCurrentSession()) {
      throw const ActivityMeasurementFailure('session_changed');
    }
    final cancellation = CancelToken();
    _pending.add(cancellation);
    if (render) _renders.add(cancellation);
    try {
      final token = await Future.any<String?>([
        _readAuthToken(),
        cancellation.whenCancel.then((_) => null),
      ]);
      if (_cancelled || cancellation.isCancelled || !_isCurrentSession()) {
        throw const ActivityMeasurementFailure('session_changed');
      }
      if (token == null || token.isEmpty) {
        throw const ActivityMeasurementFailure('sign_in_required');
      }
      final response = await _dio.request<Map<String, dynamic>>(
        path,
        data: body,
        options: Options(
          method: method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          sendTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ),
        cancelToken: cancellation,
      );
      if (_cancelled || !_isCurrentSession()) {
        throw const ActivityMeasurementFailure('session_changed');
      }
      if (response.data == null) {
        throw const ActivityMeasurementFailure('source_unavailable');
      }
      return response.data!;
    } on DioException catch (error) {
      if (CancelToken.isCancel(error)) {
        throw const ActivityMeasurementFailure('session_changed');
      }
      throw ActivityMeasurementFailure(switch (error.response?.statusCode) {
        401 => 'sign_in_required',
        409 => 'consent_changed',
        429 => 'rate_limited',
        _ => 'source_unavailable',
      });
    } finally {
      _pending.remove(cancellation);
      _renders.remove(cancellation);
    }
  }

  @override
  Future<ActivityConsentRecord> status() async =>
      ActivityConsentRecord.fromJson(
        await _request('/api/analytics/activity-consent', 'GET'),
      );

  @override
  Future<ActivityConsentRecord> setConsent(
    ActivityConsentRecord current, {
    required bool enabled,
  }) async => ActivityConsentRecord.fromJson(
    await _request(
      '/api/analytics/activity-consent',
      'PUT',
      body: {
        'enabled': enabled,
        'expectedRevision': current.revision,
        'expectedEpoch': current.epoch,
        'accountScope': current.accountScope,
        'noticeVersion': activityNoticeVersion,
      },
    ),
  );

  @override
  Future<String> recordForegroundRender(ActivityConsentRecord current) async {
    if (!current.pilotEnabled || !current.granted || current.epoch == null) {
      throw const ActivityMeasurementFailure('consent_required');
    }
    final result = await _request(
      '/api/analytics/activity',
      'POST',
      render: true,
      body: {
        'signal': 'foreground_app_render',
        'consentRevision': current.revision,
        'consentEpoch': current.epoch,
        'accountScope': current.accountScope,
        'noticeVersion': activityNoticeVersion,
      },
    );
    final day = result['activeDay'];
    if (day is! String ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(day) ||
        DateTime.tryParse(
              '${day}T00:00:00Z',
            )?.toIso8601String().substring(0, 10) !=
            day ||
        result['inserted'] is! bool) {
      throw const ActivityMeasurementFailure('source_unavailable');
    }
    return day;
  }

  @override
  void cancelRenders() {
    for (final token in _renders.toList()) {
      token.cancel('activity_consent_changed');
    }
  }

  @override
  void cancelPending() {
    _cancelled = true;
    for (final token in _pending.toList()) {
      token.cancel('activity_session_changed');
    }
  }
}
