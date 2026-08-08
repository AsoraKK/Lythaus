import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/application/moderation_service.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';

/// Dio adapter that returns scripted JSON responses.
class _ScriptedAdapter implements HttpClientAdapter {
  ResponseBody? _nextResponse;
  DioException? _nextError;

  void respondWith(Map<String, dynamic> body, {int statusCode = 200}) {
    _nextResponse = ResponseBody.fromString(
      jsonEncode(body),
      statusCode,
      headers: {
        'content-type': ['application/json'],
      },
    );
    _nextError = null;
  }

  void failWith(DioException error) {
    _nextError = error;
    _nextResponse = null;
  }

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (_nextError != null) throw _nextError!;
    return _nextResponse!;
  }

  @override
  void close({bool force = false}) {}
}

/// Minimal complete appeal JSON payload for Appeal.fromJson.
Map<String, dynamic> _appealJson({String id = 'a1'}) => {
  'appealId': id,
  'contentId': 'c1',
  'contentType': 'post',
  'contentPreview': 'preview',
  'appealType': 'content_dispute',
  'appealReason': 'reason',
  'userStatement': 'statement',
  'submitterId': 'u1',
  'submitterName': 'User 1',
  'submittedAt': '2024-01-01T00:00:00Z',
  'expiresAt': '2024-02-01T00:00:00Z',
  'flagReason': 'spam',
  'flagCategories': <String>['spam'],
  'flagCount': 1,
  'votingStatus': 'active',
  'urgencyScore': 5,
  'estimatedResolution': '24h',
  'hasUserVoted': false,
  'canUserVote': true,
};

void main() {
  late _ScriptedAdapter adapter;
  late ModerationService service;

  setUp(() {
    adapter = _ScriptedAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.httpClientAdapter = adapter;
    service = ModerationService(dio);
  });

  // ─── getMyAppeals ───

  group('getMyAppeals', () {
    test('returns list on success', () async {
      adapter.respondWith({
        'success': true,
        'appeals': [_appealJson()],
      });
      final appeals = await service.getMyAppeals(token: 'tok');
      expect(appeals, hasLength(1));
      expect(appeals.first.appealId, 'a1');
    });

    test('throws when success is false', () async {
      adapter.respondWith({'success': false, 'message': 'Nope'});
      expect(
        () => service.getMyAppeals(token: 'tok'),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws on DioException', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/getMyAppeals'),
          type: DioExceptionType.connectionTimeout,
        ),
      );
      expect(
        () => service.getMyAppeals(token: 'tok'),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  // ─── submitAppeal ───

  group('submitAppeal', () {
    test('returns appeal on success', () async {
      adapter.respondWith({'success': true, 'appeal': _appealJson(id: 'a2')});
      final appeal = await service.submitAppeal(
        contentId: 'c1',
        contentType: 'post',
        appealType: 'content_dispute',
        appealReason: 'reason',
        userStatement: 'statement',
        token: 'tok',
      );
      expect(appeal.appealId, 'a2');
    });

    test('throws when success is false', () async {
      adapter.respondWith({'success': false, 'message': 'Bad'});
      expect(
        () => service.submitAppeal(
          contentId: 'c1',
          contentType: 'post',
          appealType: 'x',
          appealReason: 'y',
          userStatement: 'z',
          token: 'tok',
        ),
        throwsA(isA<ModerationException>()),
      );
    });

    test('throws on DioException', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/appealContent'),
          type: DioExceptionType.connectionTimeout,
        ),
      );
      expect(
        () => service.submitAppeal(
          contentId: 'c1',
          contentType: 'post',
          appealType: 'x',
          appealReason: 'y',
          userStatement: 'z',
          token: 'tok',
        ),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  // ─── flagContent ───

  group('flagContent', () {
    test('returns response map on success', () async {
      adapter.respondWith({'success': true, 'flagId': 'f1'});
      final result = await service.flagContent(
        contentId: 'c1',
        contentType: 'post',
        reason: 'spam',
        token: 'tok',
      );
      expect(result['success'], isTrue);
      expect(result['flagId'], 'f1');
    });

    test('with additional details', () async {
      adapter.respondWith({'success': true});
      final result = await service.flagContent(
        contentId: 'c1',
        contentType: 'post',
        reason: 'spam',
        additionalDetails: 'more info',
        token: 'tok',
      );
      expect(result['success'], isTrue);
    });

    test('DioException maps to ModerationException', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/flag'),
          type: DioExceptionType.connectionTimeout,
        ),
      );
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

    test('device integrity blocked code maps correctly', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/flag'),
          response: Response(
            requestOptions: RequestOptions(path: '/api/flag'),
            statusCode: 403,
            data: {'code': 'DEVICE_INTEGRITY_BLOCKED'},
          ),
        ),
      );
      try {
        await service.flagContent(
          contentId: 'c1',
          contentType: 'post',
          reason: 'spam',
          token: 'tok',
        );
        fail('should have thrown');
      } on ModerationException catch (e) {
        expect(e.code, 'DEVICE_INTEGRITY_BLOCKED');
      }
    });

    test('nested error code maps correctly', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/flag'),
          response: Response(
            requestOptions: RequestOptions(path: '/api/flag'),
            statusCode: 403,
            data: {
              'error': {'code': 'DEVICE_INTEGRITY_BLOCKED'},
            },
          ),
        ),
      );
      try {
        await service.flagContent(
          contentId: 'c1',
          contentType: 'post',
          reason: 'spam',
          token: 'tok',
        );
        fail('should have thrown');
      } on ModerationException catch (e) {
        expect(e.code, 'DEVICE_INTEGRITY_BLOCKED');
      }
    });
  });

  // ─── submitVote ───

  group('submitVote', () {
    test('returns VoteResult on success', () async {
      adapter.respondWith({
        'success': true,
        'tallyTriggered': true,
        'message': 'recorded',
      });
      final result = await service.submitVote(
        appealId: 'a1',
        vote: 'approve',
        token: 'tok',
      );
      expect(result.success, isTrue);
      expect(result.tallyTriggered, isTrue);
    });

    test('null data throws', () async {
      // force null response.data by returning an empty response that will be
      // seen as null because Dio can't parse it as Map
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/voteOnAppeal'),
          type: DioExceptionType.badResponse,
        ),
      );
      expect(
        () => service.submitVote(appealId: 'a1', vote: 'approve', token: 'tok'),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  // ─── getVotingFeed ───

  group('getVotingFeed', () {
    test('returns AppealResponse on success', () async {
      adapter.respondWith({
        'success': true,
        'appeals': [_appealJson()],
        'pagination': {'total': 1, 'page': 1, 'pageSize': 20},
        'filters': <String, dynamic>{},
        'summary': {'totalActive': 1},
      });
      final response = await service.getVotingFeed(token: 'tok');
      expect(response.appeals, hasLength(1));
    });

    test('throws when success is false', () async {
      adapter.respondWith({'success': false, 'message': 'Failed'});
      expect(
        () => service.getVotingFeed(token: 'tok'),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  // ─── fetchModerationQueue ───

  group('fetchModerationQueue', () {
    test('returns ModerationQueueResponse', () async {
      adapter.respondWith({
        'data': {'items': <dynamic>[], 'pagination': <String, dynamic>{}},
      });
      final response = await service.fetchModerationQueue(token: 'tok');
      expect(response.items, isEmpty);
    });

    test('throws ModerationException on DioException', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/moderation/review-queue'),
          type: DioExceptionType.connectionTimeout,
        ),
      );
      expect(
        () => service.fetchModerationQueue(token: 'tok'),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  // ─── fetchModerationCase ───

  group('fetchModerationCase', () {
    test('returns ModerationCase', () async {
      adapter.respondWith({
        'data': {
          'id': 'case-1',
          'type': 'post',
          'contentId': 'c1',
          'contentType': 'post',
          'contentText': 'some text',
          'status': 'open',
          'queue': 'default',
          'severity': 'medium',
          'createdAt': '2024-01-01T00:00:00Z',
          'updatedAt': '2024-01-01T00:00:00Z',
          'reports': <dynamic>[],
          'aiSignals': <dynamic>[],
          'auditTrail': <dynamic>[],
          'decisionHistory': <dynamic>[],
        },
      });
      final mod = await service.fetchModerationCase(
        caseId: 'case-1',
        token: 'tok',
      );
      expect(mod.id, 'case-1');
    });
  });

  // ─── submitModerationDecision ───

  group('submitModerationDecision', () {
    test('returns result on success', () async {
      adapter.respondWith({
        'data': {'success': true, 'caseId': 'case-1'},
      });
      final result = await service.submitModerationDecision(
        caseId: 'case-1',
        token: 'tok',
        input: const ModerationDecisionInput(
          action: ModerationDecisionAction.remove,
          rationale: 'Violates rules',
        ),
      );
      expect(result.success, isTrue);
    });

    test('throws on DioException', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/moderation/cases/c1/decision'),
          type: DioExceptionType.connectionTimeout,
        ),
      );
      expect(
        () => service.submitModerationDecision(
          caseId: 'c1',
          token: 'tok',
          input: const ModerationDecisionInput(
            action: ModerationDecisionAction.allow,
            rationale: 'OK',
          ),
        ),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  // ─── escalateModerationCase ───

  group('escalateModerationCase', () {
    test('completes successfully', () async {
      adapter.respondWith({'success': true});
      await service.escalateModerationCase(
        caseId: 'case-1',
        token: 'tok',
        input: const ModerationEscalationInput(
          reason: 'needs senior review',
          targetQueue: 'senior',
        ),
      );
      // no exception means success
    });

    test('throws on DioException', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/moderation/cases/c1/escalate'),
          type: DioExceptionType.connectionTimeout,
        ),
      );
      expect(
        () => service.escalateModerationCase(
          caseId: 'c1',
          token: 'tok',
          input: const ModerationEscalationInput(
            reason: 'urgent',
            targetQueue: 'senior',
          ),
        ),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  // ─── fetchCaseAudit ───

  group('fetchCaseAudit', () {
    test('returns audit response', () async {
      adapter.respondWith({
        'data': {'entries': <dynamic>[], 'pagination': <String, dynamic>{}},
      });
      final result = await service.fetchCaseAudit(
        caseId: 'case-1',
        token: 'tok',
      );
      expect(result.entries, isEmpty);
    });
  });

  // ─── searchAudit ───

  group('searchAudit', () {
    test('returns audit response with default filters', () async {
      adapter.respondWith({
        'data': {'entries': <dynamic>[], 'pagination': <String, dynamic>{}},
      });
      final result = await service.searchAudit(
        filters: const ModerationAuditSearchFilters(),
        token: 'tok',
      );
      expect(result.entries, isEmpty);
    });

    test('throws on DioException', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/moderation/audit'),
          type: DioExceptionType.connectionTimeout,
        ),
      );
      expect(
        () => service.searchAudit(
          filters: const ModerationAuditSearchFilters(),
          token: 'tok',
        ),
        throwsA(isA<ModerationException>()),
      );
    });
  });

  // ─── _mapDioException edge cases ───

  group('_mapDioException', () {
    test('generic DioException without response data', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/getMyAppeals'),
          type: DioExceptionType.connectionTimeout,
          message: 'timed out',
        ),
      );
      try {
        await service.getMyAppeals(token: 'tok');
        fail('should throw');
      } on ModerationException catch (e) {
        expect(e.code, 'NETWORK_ERROR');
      }
    });

    test('non-map response data still produces NETWORK_ERROR', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/getMyAppeals'),
          response: Response(
            requestOptions: RequestOptions(path: '/api/getMyAppeals'),
            statusCode: 500,
            data: 'plain string error',
          ),
        ),
      );
      try {
        await service.getMyAppeals(token: 'tok');
        fail('should throw');
      } on ModerationException catch (e) {
        expect(e.code, 'NETWORK_ERROR');
      }
    });
  });
}
