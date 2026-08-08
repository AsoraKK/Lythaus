import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/services/moderation_service.dart';

class MockDio extends Mock implements Dio {}

Response<Map<String, dynamic>> _response(
  Map<String, dynamic> data,
  String path, {
  int? statusCode,
}) {
  return Response<Map<String, dynamic>>(
    data: data,
    statusCode: statusCode ?? 200,
    requestOptions: RequestOptions(path: path),
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(Options());
  });

  test(
    'ModerationClient flag/appeal/vote calls return response data',
    () async {
      final dio = MockDio();
      final client = ModerationClient(dio);

      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/flag',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async => _response({'success': true}, '/api/flag'));

      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/appealContent',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => _response({
          'success': true,
          'appealId': 'appeal-1',
        }, '/api/appealContent'),
      );

      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/voteOnAppeal',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => _response({
          'success': true,
          'tallyTriggered': true,
        }, '/api/voteOnAppeal'),
      );

      final flag = await client.flagContent(
        contentId: 'content-1',
        contentType: 'post',
        reason: 'spam',
        additionalDetails: 'details',
        token: 'token',
      );
      expect(flag['success'], true);

      final appeal = await client.appealContent(
        contentId: 'content-1',
        contentType: 'post',
        appealType: 'moderation',
        appealReason: 'reason',
        userStatement: 'statement',
        token: 'token',
      );
      expect(appeal['appealId'], 'appeal-1');

      final vote = await client.voteOnAppeal(
        appealId: 'appeal-1',
        vote: 'approve',
        comment: 'ok',
        token: 'token',
      );
      expect(vote['tallyTriggered'], true);
    },
  );

  test('ModerationClient fetch helpers include query params', () async {
    final dio = MockDio();
    final client = ModerationClient(dio);

    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/getMyAppeals',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({'success': true}, '/api/getMyAppeals'),
    );

    when(
      () => dio.get<Map<String, dynamic>>(
        '/api/reviewAppealedContent',
        queryParameters: any(named: 'queryParameters'),
        options: any(named: 'options'),
      ),
    ).thenAnswer(
      (_) async => _response({'success': true}, '/api/reviewAppealedContent'),
    );

    final appeals = await client.getMyAppeals(
      token: 'token',
      page: 2,
      pageSize: 10,
      status: 'open',
      contentType: 'post',
      reviewQueue: 'default',
    );
    expect(appeals['success'], true);

    final voting = await client.getAppealedContent(
      token: 'token',
      page: 1,
      pageSize: 5,
      contentType: 'post',
      sortBy: 'urgency',
    );
    expect(voting['success'], true);

    final helper = await client.getAppealsForVoting(token: 'token');
    expect(helper['success'], true);
  });

  test('ModerationClient submitVote handles errors', () async {
    final dio = MockDio();
    final client = ModerationClient(dio);

    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/voteOnAppeal',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenThrow(Exception('boom'));

    final result = await client.submitVote(
      appealId: 'appeal-1',
      vote: 'approve',
      token: 'token',
    );
    expect(result['success'], false);
    expect(result['tallyTriggered'], false);
  });

  test('VotingProgress and AppealHistoryItem parse JSON', () {
    final progress = VotingProgress.fromJson({
      'totalVotes': 10,
      'approveVotes': 7,
      'rejectVotes': 3,
      'approvalRate': 0.7,
      'quorumMet': true,
      'timeRemaining': '2h',
      'estimatedResolution': 'soon',
    });
    expect(progress.approvalRate, 0.7);
    expect(progress.quorumMet, true);

    final history = AppealHistoryItem.fromJson({
      'appealId': 'appeal-1',
      'contentId': 'content-1',
      'contentType': 'post',
      'appealType': 'moderation',
      'status': 'unknown',
      'reviewQueue': 'default',
      'submittedAt': '2024-01-01T00:00:00Z',
      'expiresAt': '2024-01-02T00:00:00Z',
      'appealReason': 'reason',
      'userStatement': 'statement',
      'canAppeal': true,
      'isExpired': false,
      'isUrgent': true,
      'nextSteps': ['review'],
      'votingProgress': {
        'totalVotes': 1,
        'approveVotes': 1,
        'rejectVotes': 0,
        'approvalRate': 1.0,
        'quorumMet': false,
      },
      'resolutionDetails': {'detail': 'ok'},
    });

    expect(history.status, AppealStatus.pending);
    expect(history.votingProgress?.totalVotes, 1);
    expect(history.nextSteps, ['review']);
  });
}
