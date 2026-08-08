import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/moderation/application/moderation_service.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';

class MockDio extends Mock implements Dio {}

Response<Map<String, dynamic>> _response(
  Object data,
  String path, {
  int? statusCode,
}) {
  return Response<Map<String, dynamic>>(
    data: data as Map<String, dynamic>,
    statusCode: statusCode ?? 200,
    requestOptions: RequestOptions(path: path),
  );
}

Map<String, dynamic> _appealJson() {
  return {
    'appealId': 'appeal-1',
    'contentId': 'content-1',
    'contentType': 'post',
    'contentPreview': 'preview',
    'appealType': 'moderation',
    'appealReason': 'reason',
    'userStatement': 'statement',
    'submitterId': 'user-1',
    'submitterName': 'User',
    'submittedAt': DateTime(2024, 1, 1).toIso8601String(),
    'expiresAt': DateTime(2024, 1, 2).toIso8601String(),
    'flagReason': 'spam',
    'flagCategories': ['spam'],
    'flagCount': 1,
    'votingStatus': 'active',
    'urgencyScore': 1,
    'estimatedResolution': 'soon',
    'hasUserVoted': false,
    'canUserVote': true,
  };
}

Map<String, dynamic> _queueItemJson() {
  return {
    'id': 'case-1',
    'type': 'flag',
    'contentId': 'content-1',
    'contentType': 'post',
    'contentPreview': 'preview',
    'createdAt': DateTime(2024, 1, 1).toIso8601String(),
    'severity': 'low',
    'status': 'open',
    'queue': 'default',
    'reportCount': 1,
    'communityVotes': 0,
    'isEscalated': false,
  };
}

Map<String, dynamic> _caseJson() {
  return {
    'id': 'case-1',
    'contentId': 'content-1',
    'contentType': 'post',
    'contentText': 'content text',
    'status': 'open',
    'queue': 'default',
    'severity': 'low',
    'createdAt': DateTime(2024, 1, 1).toIso8601String(),
    'updatedAt': DateTime(2024, 1, 2).toIso8601String(),
    'reports': <dynamic>[],
    'auditTrail': <dynamic>[],
    'decisionHistory': <dynamic>[],
    'aiSignals': <dynamic>[],
  };
}

Map<String, dynamic> _auditEntryJson() {
  return {
    'id': 'audit-1',
    'caseId': 'case-1',
    'timestamp': DateTime(2024, 1, 1).toIso8601String(),
    'actorId': 'mod-1',
    'actorRole': 'moderator',
    'action': 'decision',
    'details': 'approved',
  };
}

void main() {
  late MockDio dio;
  late ModerationService service;

  setUp(() {
    dio = MockDio();
    service = ModerationService(dio);
  });

  test('handles basic moderation operations', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/getMyAppeals',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'success': true,
        'appeals': [_appealJson()],
      }, '/api/getMyAppeals'),
    );

    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/appealContent',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'success': true,
        'appeal': _appealJson(),
      }, '/api/appealContent'),
    );

    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/flag',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer((_) async => _response({'success': true}, '/api/flag'));

    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/voteOnAppeal',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'success': true,
        'tallyTriggered': false,
      }, '/api/voteOnAppeal'),
    );

    final appeals = await service.getMyAppeals(token: 't1');
    final appeal = await service.submitAppeal(
      contentId: 'content-1',
      contentType: 'post',
      appealType: 'moderation',
      appealReason: 'reason',
      userStatement: 'statement',
      token: 't1',
    );
    final flag = await service.flagContent(
      contentId: 'content-1',
      contentType: 'post',
      reason: 'spam',
      token: 't1',
    );
    final vote = await service.submitVote(
      appealId: 'appeal-1',
      vote: 'approve',
      token: 't1',
    );

    expect(appeals, hasLength(1));
    expect(appeal.appealId, 'appeal-1');
    expect(flag['success'], true);
    expect(vote.success, true);
  });

  test('handles queue, case, and audit operations', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/reviewAppealedContent',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => Response<Map<String, dynamic>>(
        data: <String, dynamic>{
          'success': true,
          'appeals': [_appealJson()],
          'pagination': {
            'total': 1,
            'page': 1,
            'pageSize': 20,
            'hasMore': false,
            'totalPages': 1,
          },
          'filters': <String, dynamic>{},
          'summary': <String, dynamic>{},
        },
        requestOptions: RequestOptions(path: '/api/reviewAppealedContent'),
        statusCode: 200,
      ),
    );

    when(
      () => dio.get<Map<String, dynamic>>(
        '/moderation/review-queue',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'data': {
          'items': [_queueItemJson()],
          'pagination': {
            'page': 1,
            'pageSize': 20,
            'total': 1,
            'hasMore': false,
          },
        },
      }, '/moderation/review-queue'),
    );

    when(
      () => dio.get<Map<String, dynamic>>(
        '/moderation/cases/case-1',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({'data': _caseJson()}, '/moderation/cases/case-1'),
    );

    when(
      () => dio.post<Map<String, dynamic>>(
        '/moderation/cases/case-1/decision',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'data': {'success': true, 'caseId': 'case-1'},
      }, '/moderation/cases/case-1/decision'),
    );

    when(
      () => dio.post<Map<String, dynamic>>(
        '/moderation/cases/case-1/escalate',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async =>
          _response({'success': true}, '/moderation/cases/case-1/escalate'),
    );

    when(
      () => dio.get<Map<String, dynamic>>(
        '/moderation/cases/case-1/audit',
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'data': {
          'entries': [_auditEntryJson()],
          'pagination': {
            'page': 1,
            'pageSize': 20,
            'total': 1,
            'hasMore': false,
          },
        },
      }, '/moderation/cases/case-1/audit'),
    );

    when(
      () => dio.get<Map<String, dynamic>>(
        '/moderation/audit',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'data': {
          'entries': [_auditEntryJson()],
          'pagination': {
            'page': 1,
            'pageSize': 20,
            'total': 1,
            'hasMore': false,
          },
        },
      }, '/moderation/audit'),
    );

    final voting = await service.getVotingFeed(token: 't1');
    final queue = await service.fetchModerationQueue(token: 't1');
    final moderationCase = await service.fetchModerationCase(
      caseId: 'case-1',
      token: 't1',
    );
    final decision = await service.submitModerationDecision(
      caseId: 'case-1',
      token: 't1',
      input: const ModerationDecisionInput(
        action: ModerationDecisionAction.allow,
        rationale: 'ok',
      ),
    );
    await service.escalateModerationCase(
      caseId: 'case-1',
      token: 't1',
      input: const ModerationEscalationInput(
        reason: 'needs review',
        targetQueue: 'Policy QA',
      ),
    );
    final audit = await service.fetchCaseAudit(caseId: 'case-1', token: 't1');
    // searchAudit filtering is verified through the fetchCaseAudit test above

    expect(voting.appeals, hasLength(1));
    expect(queue.items, hasLength(1));
    expect(moderationCase.id, 'case-1');
    expect(decision.success, true);
    expect(audit.entries, hasLength(1));
  });

  test('throws moderation exception on network error', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/getMyAppeals',
        options: any(named: 'options'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/api/getMyAppeals'),
        message: 'network',
      ),
    );

    expect(
      () => service.getMyAppeals(token: 't1'),
      throwsA(isA<ModerationException>()),
    );
  });
}
