import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/moderation/application/moderation_service.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';

class MockDio extends Mock implements Dio {}

DioException _dioError(String path, {Map<String, dynamic>? data, int? status}) {
  return DioException(
    requestOptions: RequestOptions(path: path),
    response: data != null
        ? Response(
            data: data,
            statusCode: status ?? 500,
            requestOptions: RequestOptions(path: path),
          )
        : null,
    message: 'mock error',
  );
}

void main() {
  late MockDio dio;
  late ModerationService service;

  setUp(() {
    dio = MockDio();
    service = ModerationService(dio);
  });

  // ────── _mapDioException ──────

  group('_mapDioException via error paths', () {
    test('maps device integrity blocked code correctly', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/getMyAppeals',
          options: any(named: 'options'),
        ),
      ).thenThrow(
        _dioError(
          '/api/getMyAppeals',
          data: {'code': 'DEVICE_INTEGRITY_BLOCKED'},
        ),
      );

      expect(
        () => service.getMyAppeals(token: 'tok'),
        throwsA(
          isA<ModerationException>().having(
            (e) => e.code,
            'code',
            'DEVICE_INTEGRITY_BLOCKED',
          ),
        ),
      );
    });

    test('maps nested error code', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/getMyAppeals',
          options: any(named: 'options'),
        ),
      ).thenThrow(
        _dioError(
          '/api/getMyAppeals',
          data: {
            'error': {'code': 'SOME_CODE'},
          },
        ),
      );

      expect(
        () => service.getMyAppeals(token: 'tok'),
        throwsA(
          isA<ModerationException>().having((e) => e.code, 'code', 'SOME_CODE'),
        ),
      );
    });

    test('maps generic network error', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/getMyAppeals',
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/getMyAppeals'),
          message: 'timeout',
        ),
      );

      expect(
        () => service.getMyAppeals(token: 'tok'),
        throwsA(
          isA<ModerationException>().having(
            (e) => e.code,
            'code',
            'NETWORK_ERROR',
          ),
        ),
      );
    });

    test('preserves rate-limit status and retry metadata', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/getMyAppeals',
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/getMyAppeals'),
          response: Response<Map<String, dynamic>>(
            data: {
              'code': 'RATE_LIMITED',
              'message':
                  'Too many moderation requests. Please wait before trying again.',
              'retry_after_seconds': 42,
            },
            statusCode: 429,
            headers: Headers.fromMap({
              'retry-after': ['42'],
            }),
            requestOptions: RequestOptions(path: '/api/getMyAppeals'),
          ),
        ),
      );

      expect(
        () => service.getMyAppeals(token: 'tok'),
        throwsA(
          isA<ModerationException>()
              .having((e) => e.code, 'code', 'RATE_LIMITED')
              .having((e) => e.statusCode, 'statusCode', 429)
              .having(
                (e) => e.message,
                'message',
                'Too many moderation requests. Please wait before trying again.',
              )
              .having(
                (e) => e.retryAfter,
                'retryAfter',
                const Duration(seconds: 42),
              )
              .having(
                (e) => e.payload?['retry_after_seconds'],
                'payload.retry_after_seconds',
                42,
              ),
        ),
      );
    });
  });

  // ────── flagContent error paths ──────

  group('flagContent errors', () {
    test('throws on DioException', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/flag',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/api/flag'));

      expect(
        () => service.flagContent(
          contentId: 'c1',
          contentType: 'post',
          reason: 'spam',
          token: 'tok',
        ),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws on null response data', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/flag',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<Map<String, dynamic>>(
          data: null,
          requestOptions: RequestOptions(path: '/api/flag'),
        ),
      );

      expect(
        () => service.flagContent(
          contentId: 'c1',
          contentType: 'post',
          reason: 'spam',
          token: 'tok',
        ),
        throwsA(
          isA<ModerationException>().having(
            (e) => e.code,
            'code',
            'INVALID_RESPONSE',
          ),
        ),
      );
    });

    test('throws on generic error', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/flag',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(Exception('unexpected'));

      expect(
        () => service.flagContent(
          contentId: 'c1',
          contentType: 'post',
          reason: 'spam',
          token: 'tok',
        ),
        throwsA(
          isA<ModerationException>().having(
            (e) => e.code,
            'code',
            'UNKNOWN_ERROR',
          ),
        ),
      );
    });
  });

  // ────── submitVote error paths ──────

  group('submitVote errors', () {
    test('throws on null response data', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/voteOnAppeal',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<Map<String, dynamic>>(
          data: null,
          requestOptions: RequestOptions(path: '/api/voteOnAppeal'),
        ),
      );

      expect(
        () => service.submitVote(appealId: 'a1', vote: 'approve', token: 'tok'),
        throwsA(
          isA<ModerationException>().having(
            (e) => e.code,
            'code',
            'INVALID_RESPONSE',
          ),
        ),
      );
    });

    test('throws on DioException', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/voteOnAppeal',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/api/voteOnAppeal'));

      expect(
        () => service.submitVote(appealId: 'a1', vote: 'approve', token: 'tok'),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws on generic error', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/voteOnAppeal',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(Exception('unexpected'));

      expect(
        () => service.submitVote(appealId: 'a1', vote: 'approve', token: 'tok'),
        throwsA(
          isA<ModerationException>().having(
            (e) => e.code,
            'code',
            'UNKNOWN_ERROR',
          ),
        ),
      );
    });
  });

  // ────── getVotingFeed error paths ──────

  group('getVotingFeed errors', () {
    test('throws on failure response with message', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/reviewAppealedContent',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<Map<String, dynamic>>(
          data: {'success': false, 'message': 'Custom fail'},
          requestOptions: RequestOptions(path: '/api/reviewAppealedContent'),
        ),
      );

      expect(
        () => service.getVotingFeed(token: 'tok'),
        throwsA(
          isA<ModerationException>().having(
            (e) => e.message,
            'message',
            'Custom fail',
          ),
        ),
      );
    });

    test('throws on DioException', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/reviewAppealedContent',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/api/reviewAppealedContent'));

      expect(
        () => service.getVotingFeed(token: 'tok'),
        throwsA(
          isA<ModerationException>().having(
            (e) => e.code,
            'code',
            'NETWORK_ERROR',
          ),
        ),
      );
    });

    test('throws on generic error', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/reviewAppealedContent',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenThrow(Exception('unexpected'));

      expect(
        () => service.getVotingFeed(token: 'tok'),
        throwsA(
          isA<ModerationException>().having(
            (e) => e.code,
            'code',
            'UNKNOWN_ERROR',
          ),
        ),
      );
    });
  });

  // ────── fetchModerationQueue error paths ──────

  group('fetchModerationQueue errors', () {
    test('throws on DioException', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/moderation/review-queue',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/moderation/review-queue'));

      expect(
        () => service.fetchModerationQueue(token: 'tok'),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws on generic error', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/moderation/review-queue',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenThrow(StateError('bad state'));

      expect(
        () => service.fetchModerationQueue(token: 'tok'),
        throwsA(
          isA<ModerationException>().having(
            (e) => e.code,
            'code',
            'UNKNOWN_ERROR',
          ),
        ),
      );
    });
  });

  // ────── fetchModerationCase error paths ──────

  group('fetchModerationCase errors', () {
    test('throws on DioException', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/moderation/cases/c1',
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/moderation/cases/c1'));

      expect(
        () => service.fetchModerationCase(caseId: 'c1', token: 'tok'),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws on generic error', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/moderation/cases/c1',
          options: any(named: 'options'),
        ),
      ).thenThrow(Exception('unexpected'));

      expect(
        () => service.fetchModerationCase(caseId: 'c1', token: 'tok'),
        throwsA(
          isA<ModerationException>().having(
            (e) => e.code,
            'code',
            'UNKNOWN_ERROR',
          ),
        ),
      );
    });
  });

  // ────── submitModerationDecision error paths ──────

  group('submitModerationDecision errors', () {
    test('throws on DioException', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/moderation/cases/c1/decision',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/moderation/cases/c1/decision'));

      expect(
        () => service.submitModerationDecision(
          caseId: 'c1',
          token: 'tok',
          input: const ModerationDecisionInput(
            action: ModerationDecisionAction.allow,
            rationale: 'ok',
          ),
        ),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws on generic error', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/moderation/cases/c1/decision',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(Exception('unexpected'));

      expect(
        () => service.submitModerationDecision(
          caseId: 'c1',
          token: 'tok',
          input: const ModerationDecisionInput(
            action: ModerationDecisionAction.allow,
            rationale: 'ok',
          ),
        ),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  // ────── escalateModerationCase error paths ──────

  group('escalateModerationCase errors', () {
    test('throws on DioException', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/moderation/cases/c1/escalate',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/moderation/cases/c1/escalate'));

      expect(
        () => service.escalateModerationCase(
          caseId: 'c1',
          token: 'tok',
          input: const ModerationEscalationInput(
            reason: 'needs review',
            targetQueue: 'Policy QA',
          ),
        ),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws on generic error', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/moderation/cases/c1/escalate',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(Exception('unexpected'));

      expect(
        () => service.escalateModerationCase(
          caseId: 'c1',
          token: 'tok',
          input: const ModerationEscalationInput(
            reason: 'needs review',
            targetQueue: 'Policy QA',
          ),
        ),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  // ────── fetchCaseAudit error paths ──────

  group('fetchCaseAudit errors', () {
    test('throws on DioException', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/moderation/cases/c1/audit',
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/moderation/cases/c1/audit'));

      expect(
        () => service.fetchCaseAudit(caseId: 'c1', token: 'tok'),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  // ────── searchAudit error paths ──────

  group('searchAudit errors', () {
    test('throws on DioException', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/moderation/audit',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/moderation/audit'));

      expect(
        () => service.searchAudit(
          filters: const ModerationAuditSearchFilters(),
          token: 'tok',
        ),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws on generic error', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/moderation/audit',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenThrow(Exception('unexpected'));

      expect(
        () => service.searchAudit(
          filters: const ModerationAuditSearchFilters(),
          token: 'tok',
        ),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  // ────── getMyAppeals failure response ──────

  group('getMyAppeals failure paths', () {
    test('throws on success=false', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/getMyAppeals',
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<Map<String, dynamic>>(
          data: {'success': false, 'message': 'not allowed'},
          requestOptions: RequestOptions(path: '/api/getMyAppeals'),
        ),
      );

      expect(
        () => service.getMyAppeals(token: 'tok'),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws on generic error', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/getMyAppeals',
          options: any(named: 'options'),
        ),
      ).thenThrow(Exception('unexpected'));

      expect(
        () => service.getMyAppeals(token: 'tok'),
        throwsA(
          isA<ModerationException>().having(
            (e) => e.code,
            'code',
            'UNKNOWN_ERROR',
          ),
        ),
      );
    });
  });

  // ────── submitAppeal failure paths ──────

  group('submitAppeal failure paths', () {
    test('throws on success=false', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/appealContent',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<Map<String, dynamic>>(
          data: {'success': false},
          requestOptions: RequestOptions(path: '/api/appealContent'),
        ),
      );

      expect(
        () => service.submitAppeal(
          contentId: 'c1',
          contentType: 'post',
          appealType: 'moderation',
          appealReason: 'reason',
          userStatement: 'statement',
          token: 'tok',
        ),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws on DioException', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/appealContent',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(_dioError('/api/appealContent'));

      expect(
        () => service.submitAppeal(
          contentId: 'c1',
          contentType: 'post',
          appealType: 'moderation',
          appealReason: 'reason',
          userStatement: 'statement',
          token: 'tok',
        ),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws on generic error', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/appealContent',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(Exception('unexpected'));

      expect(
        () => service.submitAppeal(
          contentId: 'c1',
          contentType: 'post',
          appealType: 'moderation',
          appealReason: 'reason',
          userStatement: 'statement',
          token: 'tok',
        ),
        throwsA(isA<ModerationException>()),
      );
    });
  });
}
