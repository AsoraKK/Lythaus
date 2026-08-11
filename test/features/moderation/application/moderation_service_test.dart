import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/moderation/application/moderation_service.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';

class _MockDio extends Mock implements Dio {}

Response<Map<String, dynamic>> _response(
  Map<String, dynamic> data,
  String path,
) {
  return Response<Map<String, dynamic>>(
    data: data,
    requestOptions: RequestOptions(path: path),
  );
}

Map<String, dynamic> _caseJson() => {
  'id': 'case-1',
  'type': 'flag',
  'contentId': 'content-1',
  'contentType': 'post',
  'contentText': 'content text',
  'status': 'open',
  'queue': 'default',
  'severity': 'low',
  'createdAt': '2024-01-01T00:00:00Z',
  'updatedAt': '2024-01-02T00:00:00Z',
  'reports': <dynamic>[],
  'aiSignals': <dynamic>[],
  'auditTrail': <dynamic>[],
  'decisionHistory': <dynamic>[],
};

void main() {
  late _MockDio dio;
  late ModerationService service;

  setUp(() {
    dio = _MockDio();
    service = ModerationService(dio);
  });

  test('flags content through the supported flag endpoint', () async {
    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/flag',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async =>
          _response({'success': true, 'flagId': 'flag-1'}, '/api/flag'),
    );

    final result = await service.flagContent(
      contentId: 'content-1',
      contentType: 'post',
      reason: 'spam',
      additionalDetails: 'Repeated promotional links',
      token: 'token',
    );

    expect(result, {'success': true, 'flagId': 'flag-1'});
    verify(
      () => dio.post<Map<String, dynamic>>(
        '/api/flag',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).called(1);
  });

  test('handles retained staff-console moderation operations', () async {
    when(
      () => dio.get<Map<String, dynamic>>(
        '/moderation/review-queue',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({
        'data': {'items': <dynamic>[], 'pagination': <String, dynamic>{}},
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
        'data': {'entries': <dynamic>[], 'pagination': <String, dynamic>{}},
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
        'data': {'entries': <dynamic>[], 'pagination': <String, dynamic>{}},
      }, '/moderation/audit'),
    );

    final queue = await service.fetchModerationQueue(token: 'token');
    final moderationCase = await service.fetchModerationCase(
      caseId: 'case-1',
      token: 'token',
    );
    final decision = await service.submitModerationDecision(
      caseId: 'case-1',
      token: 'token',
      input: const ModerationDecisionInput(
        action: ModerationDecisionAction.allow,
        rationale: 'Policy permits this content.',
      ),
    );
    await service.escalateModerationCase(
      caseId: 'case-1',
      token: 'token',
      input: const ModerationEscalationInput(
        reason: 'Needs policy review.',
        targetQueue: 'Policy QA',
      ),
    );
    final caseAudit = await service.fetchCaseAudit(
      caseId: 'case-1',
      token: 'token',
    );
    final audit = await service.searchAudit(
      filters: const ModerationAuditSearchFilters(),
      token: 'token',
    );

    expect(queue.items, isEmpty);
    expect(moderationCase.id, 'case-1');
    expect(decision.success, isTrue);
    expect(caseAudit.entries, isEmpty);
    expect(audit.entries, isEmpty);
  });

  test('maps a flag-network failure to ModerationException', () async {
    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/flag',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/api/flag'),
        message: 'network',
      ),
    );

    expect(
      () => service.flagContent(
        contentId: 'content-1',
        contentType: 'post',
        reason: 'spam',
        token: 'token',
      ),
      throwsA(isA<ModerationException>()),
    );
  });
}
