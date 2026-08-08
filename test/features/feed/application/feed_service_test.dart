import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';
import 'package:lythaus/features/feed/application/feed_service.dart';
import 'package:lythaus/features/feed/domain/feed_repository.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';

class _MockDio extends Mock implements Dio {}

void main() {
  late FeedService feedService;
  late _MockDio mockDio;

  setUp(() {
    mockDio = _MockDio();
    feedService = FeedService(mockDio);
  });

  group('FeedService', () {
    test('getVotingFeed success', () async {
      final mockResponse = <String, dynamic>{
        'success': true,
        'appeals': [
          {
            'appealId': 'appeal1',
            'contentId': 'content1',
            'contentType': 'post',
            'contentTitle': 'Test content',
            'contentPreview': 'Test preview',
            'appealType': 'moderation',
            'appealReason': 'Test appeal',
            'userStatement': 'Please review',
            'submitterId': 'user1',
            'submitterName': 'Test User',
            'submittedAt': '2023-01-01T00:00:00Z',
            'expiresAt': '2023-01-08T00:00:00Z',
            'flagReason': 'spam',
            'aiScore': 0.8,
            'flagCategories': ['spam'],
            'flagCount': 1,
            'votingStatus': 'active',
            'urgencyScore': 5,
            'estimatedResolution': '2023-01-08T00:00:00Z',
            'hasUserVoted': false,
            'canUserVote': true,
          },
        ],
        'pagination': <String, dynamic>{
          'total': 1,
          'page': 1,
          'pageSize': 20,
          'hasMore': false,
          'totalPages': 1,
        },
        'filters': <String, dynamic>{},
        'summary': <String, dynamic>{},
      };

      when(
        () => mockDio.get<Map<String, dynamic>>(
          '/api/reviewAppealedContent',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response(
          data: mockResponse,
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/reviewAppealedContent'),
        ),
      );

      final result = await feedService.getVotingFeed(token: 'test_token');

      expect(result.appeals, hasLength(1));
      expect(result.appeals.first.appealId, 'appeal1');
      expect(result.pagination.page, 1);
    });

    test('getVotingFeed failure', () async {
      when(
        () => mockDio.get<Map<String, dynamic>>(
          '/api/reviewAppealedContent',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response(
          data: {'success': false, 'message': 'Failed'},
          statusCode: 400,
          requestOptions: RequestOptions(path: '/api/reviewAppealedContent'),
        ),
      );

      expect(
        () => feedService.getVotingFeed(token: 'test_token'),
        throwsA(isA<FeedException>()),
      );
    });

    test('getVotingFeed network error', () async {
      when(
        () => mockDio.get<Map<String, dynamic>>(
          '/api/reviewAppealedContent',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/reviewAppealedContent'),
          message: 'Network error',
        ),
      );

      expect(
        () => feedService.getVotingFeed(token: 'test_token'),
        throwsA(isA<FeedException>()),
      );
    });

    test('getVotingHistory success', () async {
      final mockResponse = {
        'success': true,
        'votes': [
          {
            'voteId': 'vote1',
            'appealId': 'appeal1',
            'userId': 'user1',
            'vote': 'approve',
            'comment': 'Good content',
            'timestamp': '2023-01-01T00:00:00Z',
            'isValidated': true,
          },
        ],
      };

      when(
        () => mockDio.get<Map<String, dynamic>>(
          '/api/getMyVotes',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response(
          data: mockResponse,
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/getMyVotes'),
        ),
      );

      final result = await feedService.getVotingHistory(token: 'test_token');

      expect(result, hasLength(1));
      expect(result.first.voteId, 'vote1');
    });

    test('getVotingHistory failure', () async {
      when(
        () => mockDio.get<Map<String, dynamic>>(
          '/api/getMyVotes',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response(
          data: {'success': false, 'message': 'Failed'},
          statusCode: 400,
          requestOptions: RequestOptions(path: '/api/getMyVotes'),
        ),
      );

      expect(
        () => feedService.getVotingHistory(token: 'test_token'),
        throwsA(isA<FeedException>()),
      );
    });

    test('getFeedMetrics success', () async {
      final mockResponse = {
        'success': true,
        'metrics': {
          'totalActiveAppeals': 10,
          'userVotesToday': 5,
          'userTotalVotes': 100,
          'userParticipationRate': 0.8,
          'categoryBreakdown': {'spam': 3, 'hate': 2},
          'featuredAppeals': ['appeal1', 'appeal2'],
        },
      };

      when(
        () => mockDio.get<Map<String, dynamic>>(
          '/api/getFeedMetrics',
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response(
          data: mockResponse,
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/getFeedMetrics'),
        ),
      );

      final result = await feedService.getFeedMetrics(token: 'test_token');

      expect(result.totalActiveAppeals, 10);
      expect(result.userVotesToday, 5);
      expect(result.userParticipationRate, 0.8);
    });

    test('getFeedMetrics failure', () async {
      when(
        () => mockDio.get<Map<String, dynamic>>(
          '/api/getFeedMetrics',
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response(
          data: {'success': false, 'message': 'Failed'},
          statusCode: 400,
          requestOptions: RequestOptions(path: '/api/getFeedMetrics'),
        ),
      );

      expect(
        () => feedService.getFeedMetrics(token: 'test_token'),
        throwsA(isA<FeedException>()),
      );
    });

    test('getVotingHistory network error throws FeedException', () async {
      when(
        () => mockDio.get<Map<String, dynamic>>(
          '/api/getMyVotes',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/getMyVotes'),
          message: 'Connection reset',
        ),
      );

      expect(
        () => feedService.getVotingHistory(token: 'test_token'),
        throwsA(
          isA<FeedException>().having((e) => e.code, 'code', 'NETWORK_ERROR'),
        ),
      );
    });

    test('getFeedMetrics DioException throws FeedException', () async {
      when(
        () => mockDio.get<Map<String, dynamic>>(
          '/api/getFeedMetrics',
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/getFeedMetrics'),
          message: 'Timeout',
        ),
      );

      expect(
        () => feedService.getFeedMetrics(token: 'test_token'),
        throwsA(
          isA<FeedException>().having((e) => e.code, 'code', 'NETWORK_ERROR'),
        ),
      );
    });

    test('getVotingFeed with filters passes filter count', () async {
      const filters = AppealFilters(contentType: 'post');
      when(
        () => mockDio.get<Map<String, dynamic>>(
          '/api/reviewAppealedContent',
          queryParameters: any(named: 'queryParameters'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response(
          data: {
            'success': true,
            'appeals': <Map<String, dynamic>>[],
            'pagination': {
              'currentPage': 1,
              'pageSize': 20,
              'totalItems': 0,
              'totalPages': 0,
            },
          },
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/reviewAppealedContent'),
        ),
      );

      final result = await feedService.getVotingFeed(
        token: 'test_token',
        filters: filters,
      );
      expect(result.appeals, isEmpty);
    });
  });
}
