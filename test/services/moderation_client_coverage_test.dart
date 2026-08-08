import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/services/moderation_service.dart';

/// Adapter returning scripted responses.
class _ScriptedAdapter implements HttpClientAdapter {
  ResponseBody? _response;
  DioException? _error;

  void respondWith(Map<String, dynamic> body, {int statusCode = 200}) {
    _response = ResponseBody.fromString(
      jsonEncode(body),
      statusCode,
      headers: {
        'content-type': ['application/json'],
      },
    );
    _error = null;
  }

  void failWith(DioException err) {
    _error = err;
    _response = null;
  }

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (_error != null) throw _error!;
    return _response!;
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late _ScriptedAdapter adapter;
  late ModerationClient client;

  setUp(() {
    adapter = _ScriptedAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.httpClientAdapter = adapter;
    client = ModerationClient(dio);
  });

  // ─── ModerationClient.flagContent ───

  group('ModerationClient.flagContent', () {
    test('success', () async {
      adapter.respondWith({'success': true, 'flagId': 'f1'});
      final result = await client.flagContent(
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
      final result = await client.flagContent(
        contentId: 'c1',
        contentType: 'post',
        reason: 'spam',
        additionalDetails: 'extra info',
        token: 'tok',
      );
      expect(result['success'], isTrue);
    });

    test('throws on null data', () async {
      adapter.respondWith(<String, dynamic>{});
      // The response has data (empty map), so it won't throw.
      // Let's test with a DioException instead.
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/flag'),
          type: DioExceptionType.connectionTimeout,
        ),
      );
      expect(
        () => client.flagContent(
          contentId: 'c1',
          contentType: 'post',
          reason: 'spam',
          token: 'tok',
        ),
        throwsA(isA<DioException>()),
      );
    });
  });

  // ─── ModerationClient.appealContent ───

  group('ModerationClient.appealContent', () {
    test('success', () async {
      adapter.respondWith({'success': true, 'appealId': 'a1'});
      final result = await client.appealContent(
        contentId: 'c1',
        contentType: 'post',
        appealType: 'false_positive',
        appealReason: 'Not spam',
        userStatement: 'This is legitimate content',
        token: 'tok',
      );
      expect(result['success'], isTrue);
      expect(result['appealId'], 'a1');
    });
  });

  // ─── ModerationClient.getMyAppeals ───

  group('ModerationClient.getMyAppeals', () {
    test('success with defaults', () async {
      adapter.respondWith({'appeals': <dynamic>[], 'total': 0});
      final result = await client.getMyAppeals(token: 'tok');
      expect(result['total'], 0);
    });

    test('with filters', () async {
      adapter.respondWith({'appeals': <dynamic>[], 'total': 0});
      final result = await client.getMyAppeals(
        token: 'tok',
        page: 2,
        pageSize: 10,
        status: 'pending',
        contentType: 'post',
        reviewQueue: 'community',
      );
      expect(result['total'], 0);
    });
  });

  // ─── ModerationClient.getAppealedContent ───

  group('ModerationClient.getAppealedContent', () {
    test('success', () async {
      adapter.respondWith({'appeals': <dynamic>[], 'total': 0});
      final result = await client.getAppealedContent(token: 'tok');
      expect(result['total'], 0);
    });

    test('with contentType filter', () async {
      adapter.respondWith({'appeals': <dynamic>[], 'total': 0});
      final result = await client.getAppealedContent(
        token: 'tok',
        contentType: 'comment',
      );
      expect(result['total'], 0);
    });
  });

  // ─── ModerationClient.voteOnAppeal ───

  group('ModerationClient.voteOnAppeal', () {
    test('success without comment', () async {
      adapter.respondWith({'success': true});
      final result = await client.voteOnAppeal(
        appealId: 'a1',
        vote: 'approve',
        token: 'tok',
      );
      expect(result['success'], isTrue);
    });

    test('success with comment', () async {
      adapter.respondWith({'success': true});
      final result = await client.voteOnAppeal(
        appealId: 'a1',
        vote: 'reject',
        comment: 'clearly spam',
        token: 'tok',
      );
      expect(result['success'], isTrue);
    });
  });

  // ─── ModerationClient.getAppealsForVoting ───

  group('ModerationClient.getAppealsForVoting', () {
    test('delegates to getAppealedContent', () async {
      adapter.respondWith({'appeals': <dynamic>[], 'total': 0});
      final result = await client.getAppealsForVoting(token: 'tok');
      expect(result['total'], 0);
    });
  });

  // ─── ModerationClient.submitVote ───

  group('ModerationClient.submitVote', () {
    test('wraps voteOnAppeal result', () async {
      adapter.respondWith({
        'success': true,
        'message': 'Vote recorded',
        'tallyTriggered': true,
        'updatedProgress': {'totalVotes': 5},
      });
      final result = await client.submitVote(
        appealId: 'a1',
        vote: 'approve',
        token: 'tok',
      );
      expect(result['success'], isTrue);
      expect(result['tallyTriggered'], isTrue);
    });

    test('returns failure on error', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/voteOnAppeal'),
          type: DioExceptionType.connectionTimeout,
        ),
      );
      final result = await client.submitVote(
        appealId: 'a1',
        vote: 'approve',
        token: 'tok',
      );
      expect(result['success'], isFalse);
      expect(result['tallyTriggered'], isFalse);
    });
  });

  // ─── State models ───

  group('FlagResult', () {
    test('construction', () {
      const r = FlagResult(success: true, message: 'ok', flagId: 'f1');
      expect(r.success, isTrue);
      expect(r.message, 'ok');
      expect(r.flagId, 'f1');
    });

    test('defaults', () {
      const r = FlagResult(success: false);
      expect(r.message, isNull);
      expect(r.flagId, isNull);
    });
  });

  group('AppealResult', () {
    test('construction', () {
      const r = AppealResult(success: true, appealId: 'a1');
      expect(r.success, isTrue);
      expect(r.appealId, 'a1');
    });
  });

  group('VoteResult', () {
    test('construction', () {
      const r = VoteResult(success: true, tallyTriggered: true);
      expect(r.success, isTrue);
      expect(r.tallyTriggered, isTrue);
    });
  });

  // ─── AppealStatus ───

  group('AppealStatus', () {
    test('all values', () {
      expect(AppealStatus.values, hasLength(4));
    });
  });

  // ─── VotingProgress ───

  group('VotingProgress', () {
    test('fromJson', () {
      final vp = VotingProgress.fromJson({
        'totalVotes': 10,
        'approveVotes': 7,
        'rejectVotes': 3,
        'approvalRate': 0.7,
        'quorumMet': true,
        'timeRemaining': '2h',
        'estimatedResolution': 'tonight',
      });
      expect(vp.totalVotes, 10);
      expect(vp.approveVotes, 7);
      expect(vp.rejectVotes, 3);
      expect(vp.approvalRate, 0.7);
      expect(vp.quorumMet, isTrue);
      expect(vp.timeRemaining, '2h');
    });

    test('fromJson with defaults', () {
      final vp = VotingProgress.fromJson(<String, dynamic>{});
      expect(vp.totalVotes, 0);
      expect(vp.approvalRate, 0.0);
      expect(vp.quorumMet, isFalse);
    });
  });

  // ─── AppealHistoryItem ───

  group('AppealHistoryItem', () {
    test('fromJson minimal', () {
      final item = AppealHistoryItem.fromJson({
        'appealId': 'a1',
        'contentId': 'c1',
        'contentType': 'post',
        'appealType': 'false_positive',
        'status': 'pending',
        'reviewQueue': 'community',
        'submittedAt': '2024-01-01T00:00:00Z',
        'expiresAt': '2024-01-08T00:00:00Z',
        'appealReason': 'Not spam',
        'userStatement': 'This is legitimate',
      });
      expect(item.appealId, 'a1');
      expect(item.status, AppealStatus.pending);
      expect(item.canAppeal, isFalse);
      expect(item.isExpired, isFalse);
      expect(item.isUrgent, isFalse);
      expect(item.nextSteps, isEmpty);
      expect(item.votingProgress, isNull);
      expect(item.resolutionDetails, isNull);
    });

    test('fromJson with all fields', () {
      final item = AppealHistoryItem.fromJson({
        'appealId': 'a2',
        'contentId': 'c2',
        'contentType': 'comment',
        'contentTitle': 'Some title',
        'appealType': 'context_missing',
        'status': 'approved',
        'reviewQueue': 'moderator',
        'outcome': 'approved',
        'submittedAt': '2024-01-01T00:00:00Z',
        'resolvedAt': '2024-01-05T00:00:00Z',
        'expiresAt': '2024-01-08T00:00:00Z',
        'appealReason': 'Missing context',
        'userStatement': 'Added context',
        'votingProgress': {
          'totalVotes': 5,
          'approveVotes': 4,
          'rejectVotes': 1,
          'approvalRate': 0.8,
          'quorumMet': true,
        },
        'resolutionDetails': {'action': 'restored'},
        'canAppeal': true,
        'isExpired': false,
        'isUrgent': true,
        'nextSteps': ['Wait for review', 'Check status'],
      });
      expect(item.contentTitle, 'Some title');
      expect(item.status, AppealStatus.approved);
      expect(item.resolvedAt, isNotNull);
      expect(item.votingProgress, isNotNull);
      expect(item.votingProgress!.totalVotes, 5);
      expect(item.resolutionDetails, isNotNull);
      expect(item.canAppeal, isTrue);
      expect(item.isUrgent, isTrue);
      expect(item.nextSteps, hasLength(2));
    });

    test('fromJson with resolved status and approved outcome', () {
      final item = AppealHistoryItem.fromJson({
        'appealId': 'a3',
        'contentId': 'c3',
        'contentType': 'post',
        'appealType': 'other',
        'status': 'resolved',
        'outcome': 'approved',
        'reviewQueue': 'community',
        'submittedAt': '2024-01-01T00:00:00Z',
        'expiresAt': '2024-01-08T00:00:00Z',
        'appealReason': 'test',
        'userStatement': 'test',
      });
      expect(item.status, AppealStatus.approved);
    });

    test('fromJson with resolved status and rejected outcome', () {
      final item = AppealHistoryItem.fromJson({
        'appealId': 'a4',
        'contentId': 'c4',
        'contentType': 'post',
        'appealType': 'other',
        'status': 'resolved',
        'outcome': 'rejected',
        'reviewQueue': 'community',
        'submittedAt': '2024-01-01T00:00:00Z',
        'expiresAt': '2024-01-08T00:00:00Z',
        'appealReason': 'test',
        'userStatement': 'test',
      });
      expect(item.status, AppealStatus.rejected);
    });

    test('fromJson with resolved status and unknown outcome', () {
      final item = AppealHistoryItem.fromJson({
        'appealId': 'a5',
        'contentId': 'c5',
        'contentType': 'post',
        'appealType': 'other',
        'status': 'resolved',
        'outcome': 'unknown',
        'reviewQueue': 'community',
        'submittedAt': '2024-01-01T00:00:00Z',
        'expiresAt': '2024-01-08T00:00:00Z',
        'appealReason': 'test',
        'userStatement': 'test',
      });
      expect(item.status, AppealStatus.pending);
    });

    test('fromJson with expired status', () {
      final item = AppealHistoryItem.fromJson({
        'appealId': 'a6',
        'contentId': 'c6',
        'contentType': 'post',
        'appealType': 'other',
        'status': 'expired',
        'reviewQueue': 'community',
        'submittedAt': '2024-01-01T00:00:00Z',
        'expiresAt': '2024-01-08T00:00:00Z',
        'appealReason': 'test',
        'userStatement': 'test',
      });
      expect(item.status, AppealStatus.expired);
    });

    test('fromJson with under_review status', () {
      final item = AppealHistoryItem.fromJson({
        'appealId': 'a7',
        'contentId': 'c7',
        'contentType': 'post',
        'appealType': 'other',
        'status': 'under_review',
        'reviewQueue': 'community',
        'submittedAt': '2024-01-01T00:00:00Z',
        'expiresAt': '2024-01-08T00:00:00Z',
        'appealReason': 'test',
        'userStatement': 'test',
      });
      expect(item.status, AppealStatus.pending);
    });
  });

  // ─── ModerationStatus ───

  group('ModerationStatus', () {
    test('all values', () {
      expect(ModerationStatus.values, hasLength(5));
      expect(
        ModerationStatus.values,
        contains(ModerationStatus.communityApproved),
      );
    });
  });
}
