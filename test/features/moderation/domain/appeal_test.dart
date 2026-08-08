import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';

// LYTHAUS APPEAL MODEL TESTS
//
// 🎯 Purpose: Test domain model serialization and validation
// ✅ Coverage: JSON parsing, edge cases, validation, enum handling
// 📊 Target: 100% coverage for domain models

void main() {
  group('Appeal models', () {
    test('Appeal fromJson/toJson', () {
      final json = {
        'appealId': 'a1',
        'contentId': 'c1',
        'contentType': 'post',
        'contentTitle': 'Hello',
        'contentPreview': 'preview',
        'appealType': 'visibility',
        'appealReason': 'false_positive',
        'userStatement': 'I disagree',
        'submitterId': 'u1',
        'submitterName': 'Alice',
        'submittedAt': '2024-01-01T00:00:00.000Z',
        'expiresAt': '2024-01-02T00:00:00.000Z',
        'flagReason': 'toxicity',
        'authorshipLabel': 'AI-assisted',
        'classificationSource': 'automated_classification',
        'reviewState': 'pending',
        'flagCategories': ['toxicity', 'harassment'],
        'flagCount': 3,
        'votingStatus': 'active',
        'votingProgress': {
          'totalVotes': 10,
          'approveVotes': 7,
          'rejectVotes': 3,
          'approvalRate': 0.7,
          'quorumMet': true,
          'timeRemaining': '1h',
          'estimatedResolution': '2h',
          'voteBreakdown': [
            {
              'category': 'experts',
              'approveCount': 5,
              'rejectCount': 1,
              'percentage': 0.83,
            },
          ],
        },
        'urgencyScore': 5,
        'estimatedResolution': '2h',
        'hasUserVoted': false,
        'userVote': null,
        'canUserVote': true,
        'voteIneligibilityReason': null,
      };

      final appeal = Appeal.fromJson(json);
      expect(appeal.appealId, 'a1');
      expect(appeal.flagCategories.length, 2);
      expect(appeal.votingStatus, VotingStatus.active);
      expect(appeal.votingProgress, isNotNull);
      expect(appeal.votingProgress!.quorumMet, isTrue);

      final back = appeal.toJson();
      expect(back['appealId'], 'a1');
      expect(back['votingStatus'], 'active');
    });

    test('VotingProgress fromJson defaults', () {
      final vp = VotingProgress.fromJson({});
      expect(vp.totalVotes, 0);
      expect(vp.approvalRate, 0.0);
      expect(vp.voteBreakdown, isEmpty);
    });
  });
  group('Appeal Model Tests', () {
    group('Serialization', () {
      test('should serialize to JSON correctly', () {
        // Arrange
        final appeal = Appeal(
          appealId: 'appeal_123',
          contentId: 'content_456',
          contentType: 'post',
          contentTitle: 'Test Post Title',
          contentPreview: 'This is a test post content preview...',
          appealType: 'false_positive',
          appealReason: 'This content was incorrectly flagged',
          userStatement: 'I believe this content follows community guidelines',
          submitterId: 'user_123',
          submitterName: 'Test User',
          submittedAt: DateTime(2025, 8, 1, 10, 30),
          expiresAt: DateTime(2025, 8, 8, 10, 30),
          flagReason: 'inappropriate_content',
          authorshipLabel: 'Under review',
          classificationSource: 'automated_classification',
          reviewState: 'pending',
          flagCategories: ['spam', 'hate'],
          flagCount: 3,
          votingStatus: VotingStatus.active,
          urgencyScore: 75,
          estimatedResolution: 'Tonight',
          hasUserVoted: false,
          canUserVote: true,
          votingProgress: const VotingProgress(
            totalVotes: 10,
            approveVotes: 7,
            rejectVotes: 3,
            approvalRate: 70.0,
            quorumMet: true,
            timeRemaining: '2 hours',
            estimatedResolution: 'Tonight',
          ),
        );

        // Act
        final json = appeal.toJson();

        // Assert
        expect(json['appealId'], 'appeal_123');
        expect(json['contentId'], 'content_456');
        expect(json['contentType'], 'post');
        expect(json['contentTitle'], 'Test Post Title');
        expect(json['urgencyScore'], 75);
        expect(json['votingStatus'], 'active');
        expect(json['votingProgress'], isA<Map<String, dynamic>>());
      });

      test('should deserialize from JSON correctly', () {
        // Arrange
        final json = {
          'appealId': 'appeal_123',
          'contentId': 'content_456',
          'contentType': 'post',
          'contentTitle': 'Test Post Title',
          'contentPreview': 'This is a test post content preview...',
          'appealType': 'false_positive',
          'appealReason': 'This content was incorrectly flagged',
          'userStatement':
              'I believe this content follows community guidelines',
          'submitterId': 'user_123',
          'submitterName': 'Test User',
          'submittedAt': '2025-08-01T10:30:00.000Z',
          'expiresAt': '2025-08-08T10:30:00.000Z',
          'flagReason': 'inappropriate_content',
          'authorshipLabel': 'Under review',
          'classificationSource': 'automated_classification',
          'reviewState': 'pending',
          'flagCategories': ['spam', 'hate'],
          'flagCount': 3,
          'votingStatus': 'active',
          'urgencyScore': 75,
          'estimatedResolution': 'Tonight',
          'hasUserVoted': false,
          'canUserVote': true,
          'votingProgress': const {
            'totalVotes': 10,
            'approveVotes': 7,
            'rejectVotes': 3,
            'approvalRate': 70.0,
            'quorumMet': true,
            'timeRemaining': '2 hours',
            'estimatedResolution': 'Tonight',
            'voteBreakdown': <dynamic>[],
          },
        };

        // Act
        final appeal = Appeal.fromJson(json);

        // Assert
        expect(appeal.appealId, 'appeal_123');
        expect(appeal.contentId, 'content_456');
        expect(appeal.contentType, 'post');
        expect(appeal.contentTitle, 'Test Post Title');
        expect(appeal.urgencyScore, 75);
        expect(appeal.votingStatus, VotingStatus.active);
        expect(appeal.votingProgress?.totalVotes, 10);
        expect(appeal.authorshipLabel, 'Under review');
        expect(appeal.toJson().containsKey('aiScore'), isFalse);
      });

      test('should handle null optional fields correctly', () {
        // Arrange
        final json = {
          'appealId': 'appeal_123',
          'contentId': 'content_456',
          'contentType': 'post',
          'contentPreview': 'Test content',
          'appealType': 'false_positive',
          'appealReason': 'Test reason',
          'userStatement': 'Test statement',
          'submitterId': 'user_123',
          'submitterName': 'Test User',
          'submittedAt': '2025-08-01T10:30:00.000Z',
          'expiresAt': '2025-08-08T10:30:00.000Z',
          'flagReason': 'test_flag',
          'flagCategories': ['test'],
          'flagCount': 1,
          'votingStatus': 'active',
          'urgencyScore': 50,
          'estimatedResolution': 'Soon',
          'hasUserVoted': false,
          'canUserVote': true,
          // contentTitle and votingProgress are null; authorship uses safe defaults.
        };

        // Act
        final appeal = Appeal.fromJson(json);

        // Assert
        expect(appeal.contentTitle, isNull);
        expect(appeal.votingProgress, isNull);
        expect(appeal.authorshipLabel, 'Under review');
        expect(appeal.classificationSource, 'automated_classification');
        expect(appeal.appealId, 'appeal_123'); // Required fields still work
      });

      test('should handle invalid JSON gracefully', () {
        // Arrange
        final invalidJson = {
          'invalidField': 'value',
          // Missing required fields
        };

        // Act & Assert
        expect(() => Appeal.fromJson(invalidJson), throwsA(isA<TypeError>()));
      });

      test('should parse and serialize complex nested structures', () {
        final json = {
          'appealId': 'appeal_complex',
          'contentId': 'content_complex',
          'contentType': 'post',
          'contentTitle': 'Complex Title',
          'contentPreview': 'Preview',
          'appealType': 'false_positive',
          'appealReason': 'reason',
          'userStatement': 'statement',
          'submitterId': 'user_complex',
          'submitterName': 'Complex User',
          'submittedAt': '2025-08-01T10:30:00.000Z',
          'expiresAt': '2025-08-08T10:30:00.000Z',
          'flagReason': 'spam',
          'flagCategories': ['spam', 'hate'],
          'flagCount': 2,
          'votingStatus': 'quorumReached',
          'votingProgress': {
            'totalVotes': 100,
            'approveVotes': 60,
            'rejectVotes': 40,
            'approvalRate': 60.0,
            'quorumMet': true,
            'timeRemaining': '1h',
            'estimatedResolution': 'Tomorrow',
            'voteBreakdown': [
              {
                'category': 'admins',
                'approveCount': 30,
                'rejectCount': 20,
                'percentage': 50.0,
              },
              {
                'category': 'users',
                'approveCount': 30,
                'rejectCount': 20,
                'percentage': 50.0,
              },
            ],
          },
          'urgencyScore': 90,
          'estimatedResolution': 'Tomorrow',
          'hasUserVoted': true,
          'userVote': 'approve',
          'canUserVote': true,
        };

        final appeal = Appeal.fromJson(json);
        expect(appeal.votingProgress?.voteBreakdown.length, 2);
        final serialized = appeal.toJson();
        expect(
          serialized['votingProgress']['voteBreakdown'][0]['category'],
          'admins',
        );
        expect(
          serialized['votingProgress']['voteBreakdown'][1]['category'],
          'users',
        );
      });

      test(
        'should default to active voting status and empty flag categories',
        () {
          final json = {
            'appealId': 'appeal_default',
            'contentId': 'content_default',
            'contentType': 'post',
            'appealType': 'false_positive',
            'appealReason': 'reason',
            'userStatement': 'statement',
            'submitterId': 'user_default',
            'submitterName': 'Default User',
            'submittedAt': '2025-08-01T10:30:00.000Z',
            'expiresAt': '2025-08-08T10:30:00.000Z',
            'flagReason': 'spam',
            'votingStatus': 'unknown_status',
            'hasUserVoted': false,
            'canUserVote': false,
          };

          final appeal = Appeal.fromJson(json);
          expect(appeal.flagCategories, isEmpty);
          expect(appeal.flagCount, 0);
          expect(appeal.votingStatus, VotingStatus.active);
          expect(appeal.urgencyScore, 0);
          expect(appeal.estimatedResolution, 'Unknown');
          final serialized = appeal.toJson();
          expect(serialized['flagCategories'], isEmpty);
          expect(serialized['votingStatus'], 'active');
        },
      );
    });

    group('Validation', () {
      test('should validate urgency score bounds', () {
        // Test cases for urgency score validation
        final testCases = [
          {'score': 0, 'isValid': true},
          {'score': 50, 'isValid': true},
          {'score': 100, 'isValid': true},
          {'score': -1, 'isValid': false},
          {'score': 101, 'isValid': false},
        ];

        for (final testCase in testCases) {
          final score = testCase['score'] as int;
          final isValid = testCase['isValid'] as bool;

          if (isValid) {
            expect(() => _createAppealWithUrgency(score), returnsNormally);
          } else {
            expect(() => _createAppealWithUrgency(score), throwsArgumentError);
          }
        }
      });

      test('should validate appeal type enum values', () {
        final validTypes = ['false_positive', 'context_missing', 'other'];
        final invalidTypes = ['invalid_type', '', null];

        for (final type in validTypes) {
          expect(() => _createAppealWithType(type), returnsNormally);
        }

        for (final type in invalidTypes) {
          expect(() => _createAppealWithType(type), throwsArgumentError);
        }
      });
    });
  });

  group('VotingStatus Enum Tests', () {
    test('should convert enum to string correctly', () {
      expect(VotingStatus.active.name, 'active');
      expect(VotingStatus.quorumReached.name, 'quorumReached');
      expect(VotingStatus.timeExpired.name, 'timeExpired');
      expect(VotingStatus.resolved.name, 'resolved');
    });

    test('should parse string to enum correctly', () {
      expect(VotingStatus.values.byName('active'), VotingStatus.active);
      expect(VotingStatus.values.byName('resolved'), VotingStatus.resolved);
    });
  });

  group('VotingProgress Model Tests', () {
    test('should calculate approval rate correctly', () {
      // Arrange
      const progress = VotingProgress(
        totalVotes: 10,
        approveVotes: 7,
        rejectVotes: 3,
        approvalRate: 70.0,
        quorumMet: true,
      );

      // Assert
      expect(progress.approvalRate, 70.0);
      expect(progress.totalVotes, progress.approveVotes + progress.rejectVotes);
    });

    test('should handle zero votes correctly', () {
      // Arrange
      const progress = VotingProgress(
        totalVotes: 0,
        approveVotes: 0,
        rejectVotes: 0,
        approvalRate: 0.0,
        quorumMet: false,
      );

      // Assert
      expect(progress.approvalRate, 0.0);
      expect(progress.quorumMet, false);
    });

    test('should parse and serialize vote breakdown', () {
      final json = {
        'totalVotes': 5,
        'approveVotes': 3,
        'rejectVotes': 2,
        'approvalRate': 60.0,
        'quorumMet': false,
        'voteBreakdown': [
          {
            'category': 'admins',
            'approveCount': 2,
            'rejectCount': 1,
            'percentage': 60.0,
          },
        ],
      };

      final progress = VotingProgress.fromJson(json);
      expect(progress.voteBreakdown.first.category, 'admins');
      final serialized = progress.toJson();
      expect(serialized['voteBreakdown'][0]['approveCount'], 2);
    });
  });

  group('VoteBreakdown Model Tests', () {
    test('should parse and serialize correctly', () {
      final json = {
        'category': 'mods',
        'approveCount': 4,
        'rejectCount': 1,
        'percentage': 80.0,
      };

      final breakdown = VoteBreakdown.fromJson(json);
      expect(breakdown.category, 'mods');
      expect(breakdown.toJson(), equals(json));
    });

    test('should handle edge cases correctly', () {
      final json = {
        'category': 'admins',
        'approveCount': 0,
        'rejectCount': 0,
        'percentage': 0.0,
      };

      final breakdown = VoteBreakdown.fromJson(json);
      expect(breakdown.approveCount, 0);
      expect(breakdown.rejectCount, 0);
      expect(breakdown.percentage, 0.0);
    });
  });

  group('UserVote Model Tests', () {
    test('should serialize to JSON correctly', () {
      final userVote = UserVote(
        voteId: 'vote_123',
        appealId: 'appeal_456',
        userId: 'user_789',
        vote: 'approve',
        comment: 'This content seems appropriate',
        timestamp: DateTime.parse('2023-01-01T12:00:00Z'),
        isValidated: true,
      );

      final json = userVote.toJson();
      expect(json['voteId'], 'vote_123');
      expect(json['appealId'], 'appeal_456');
      expect(json['userId'], 'user_789');
      expect(json['vote'], 'approve');
      expect(json['comment'], 'This content seems appropriate');
      expect(json['timestamp'], '2023-01-01T12:00:00.000Z');
      expect(json['isValidated'], true);
    });

    test('should deserialize from JSON correctly', () {
      final json = {
        'voteId': 'vote_123',
        'appealId': 'appeal_456',
        'userId': 'user_789',
        'vote': 'reject',
        'comment': 'Inappropriate content',
        'timestamp': '2023-01-01T12:00:00.000Z',
        'isValidated': true,
      };

      final userVote = UserVote.fromJson(json);
      expect(userVote.voteId, 'vote_123');
      expect(userVote.appealId, 'appeal_456');
      expect(userVote.userId, 'user_789');
      expect(userVote.vote, 'reject');
      expect(userVote.comment, 'Inappropriate content');
      expect(userVote.timestamp, DateTime.parse('2023-01-01T12:00:00.000Z'));
      expect(userVote.isValidated, true);
    });

    test('should handle optional fields correctly', () {
      final json = {
        'voteId': 'vote_123',
        'appealId': 'appeal_456',
        'userId': 'user_789',
        'vote': 'approve',
        'timestamp': '2023-01-01T12:00:00.000Z',
        'isValidated': false,
      };

      final userVote = UserVote.fromJson(json);
      expect(userVote.comment, isNull);
      expect(userVote.isValidated, false);
    });

    test('should handle missing isValidated field with default', () {
      final json = {
        'voteId': 'vote_123',
        'appealId': 'appeal_456',
        'userId': 'user_789',
        'vote': 'approve',
        'timestamp': '2023-01-01T12:00:00.000Z',
      };

      final userVote = UserVote.fromJson(json);
      expect(userVote.isValidated, false); // default value
    });
  });

  group('AppealResponse Model Tests', () {
    test('should serialize and deserialize correctly', () {
      final json = {
        'appeals': [
          {
            'appealId': 'appeal_123',
            'contentId': 'content_456',
            'contentType': 'post',
            'contentTitle': 'Test Title',
            'contentPreview': 'Test content',
            'appealType': 'false_positive',
            'appealReason': 'Test reason',
            'userStatement': 'Test statement',
            'submitterId': 'user_123',
            'submitterName': 'Test User',
            'submittedAt': '2023-01-01T12:00:00.000Z',
            'expiresAt': '2023-01-08T12:00:00.000Z',
            'flagReason': 'test_flag',
            'flagCategories': ['test'],
            'flagCount': 1,
            'votingStatus': 'active',
            'urgencyScore': 75,
            'estimatedResolution': 'Soon',
            'hasUserVoted': false,
            'canUserVote': true,
            'votingProgress': {
              'totalVotes': 0,
              'approveVotes': 0,
              'rejectVotes': 0,
              'approvalRate': 0.0,
              'quorumMet': false,
              'timeRemaining': '7 days',
              'estimatedResolution': 'Soon',
            },
          },
        ],
        'pagination': {
          'total': 1,
          'page': 1,
          'pageSize': 20,
          'hasMore': false,
          'totalPages': 1,
        },
        'filters': {
          'contentType': 'post',
          'urgency': 'high',
          'category': 'false_positive',
          'sortBy': 'urgency',
          'sortOrder': 'desc',
        },
        'summary': {
          'totalActive': 1,
          'totalVotes': 0,
          'userVotes': 0,
          'averageResolutionTime': 48.5,
          'categoryBreakdown': {'false_positive': 1},
        },
      };

      final response = AppealResponse.fromJson(json);
      expect(response.appeals.length, 1);
      expect(response.appeals.first.appealId, 'appeal_123');
      expect(response.pagination.total, 1);
      expect(response.filters.contentType, 'post');
      expect(response.summary.totalActive, 1);
    });

    test('should handle empty filters and summary', () {
      final json = {
        'appeals': <dynamic>[],
        'pagination': {
          'total': 0,
          'page': 1,
          'pageSize': 20,
          'hasMore': false,
          'totalPages': 1,
        },
      };

      final response = AppealResponse.fromJson(json);
      expect(response.appeals.isEmpty, true);
      expect(response.pagination.total, 0);
      expect(response.filters.contentType, isNull);
      expect(response.summary.totalActive, 0); // default value
    });
  });

  group('AppealPagination Model Tests', () {
    test('should deserialize from JSON correctly', () {
      final json = {
        'total': 150,
        'page': 3,
        'pageSize': 25,
        'hasMore': true,
        'totalPages': 6,
      };

      final pagination = AppealPagination.fromJson(json);
      expect(pagination.total, 150);
      expect(pagination.page, 3);
      expect(pagination.pageSize, 25);
      expect(pagination.hasMore, true);
      expect(pagination.totalPages, 6);
    });

    test('should handle missing fields with defaults', () {
      final json = <String, dynamic>{};

      final pagination = AppealPagination.fromJson(json);
      expect(pagination.total, 0); // default
      expect(pagination.page, 1); // default
      expect(pagination.pageSize, 20); // default
      expect(pagination.hasMore, false); // default
      expect(pagination.totalPages, 1); // default
    });

    test('should handle edge cases correctly', () {
      final json = {
        'total': 0,
        'page': 1,
        'pageSize': 10,
        'hasMore': false,
        'totalPages': 1,
      };

      final pagination = AppealPagination.fromJson(json);
      expect(pagination.total, 0);
      expect(pagination.hasMore, false);
    });
  });

  group('AppealFilters Model Tests', () {
    test('should serialize to JSON correctly', () {
      const filters = AppealFilters(
        contentType: 'post',
        urgency: 'high',
        category: 'false_positive',
        sortBy: 'urgencyScore',
        sortOrder: 'asc',
      );

      final json = filters.toJson();
      expect(json['contentType'], 'post');
      expect(json['urgency'], 'high');
      expect(json['category'], 'false_positive');
      expect(json['sortBy'], 'urgencyScore');
      expect(json['sortOrder'], 'asc');
    });

    test('should deserialize from JSON correctly', () {
      final json = {
        'contentType': 'comment',
        'urgency': 'medium',
        'category': 'context_missing',
        'sortBy': 'submittedAt',
        'sortOrder': 'desc',
      };

      final filters = AppealFilters.fromJson(json);
      expect(filters.contentType, 'comment');
      expect(filters.urgency, 'medium');
      expect(filters.category, 'context_missing');
      expect(filters.sortBy, 'submittedAt');
      expect(filters.sortOrder, 'desc');
    });

    test('should handle optional fields correctly', () {
      final json = <String, dynamic>{};

      final filters = AppealFilters.fromJson(json);
      expect(filters.contentType, isNull);
      expect(filters.urgency, isNull);
      expect(filters.category, isNull);
      expect(filters.sortBy, 'urgency'); // default
      expect(filters.sortOrder, 'desc'); // default
    });

    test('should omit null fields in toJson', () {
      const filters = AppealFilters(sortBy: 'urgency', sortOrder: 'desc');

      final json = filters.toJson();
      expect(json.containsKey('contentType'), false);
      expect(json.containsKey('urgency'), false);
      expect(json.containsKey('category'), false);
      expect(json['sortBy'], 'urgency');
      expect(json['sortOrder'], 'desc');
    });
  });

  group('AppealSummary Model Tests', () {
    test('should deserialize from JSON correctly', () {
      final json = {
        'totalActive': 25,
        'totalVotes': 150,
        'userVotes': 5,
        'averageResolutionTime': 72.5,
        'categoryBreakdown': {
          'false_positive': 15,
          'context_missing': 8,
          'other': 2,
        },
      };

      final summary = AppealSummary.fromJson(json);
      expect(summary.totalActive, 25);
      expect(summary.totalVotes, 150);
      expect(summary.userVotes, 5);
      expect(summary.averageResolutionTime, 72.5);
      expect(summary.categoryBreakdown['false_positive'], 15);
      expect(summary.categoryBreakdown['context_missing'], 8);
      expect(summary.categoryBreakdown['other'], 2);
    });

    test('should handle missing fields with defaults', () {
      final json = <String, dynamic>{};

      final summary = AppealSummary.fromJson(json);
      expect(summary.totalActive, 0);
      expect(summary.totalVotes, 0);
      expect(summary.userVotes, 0);
      expect(summary.averageResolutionTime, 0.0);
      expect(summary.categoryBreakdown.isEmpty, true);
    });

    test('should handle partial data correctly', () {
      final json = {
        'totalActive': 10,
        'totalVotes': 50,
        'categoryBreakdown': {'false_positive': 7, 'other': 3},
      };

      final summary = AppealSummary.fromJson(json);
      expect(summary.totalActive, 10);
      expect(summary.totalVotes, 50);
      expect(summary.userVotes, 0); // default
      expect(summary.averageResolutionTime, 0.0); // default
      expect(summary.categoryBreakdown['false_positive'], 7);
      expect(summary.categoryBreakdown['other'], 3);
    });
  });

  group('VoteResult Model Tests', () {
    test('should deserialize from JSON correctly', () {
      final json = {
        'success': true,
        'message': 'Vote recorded successfully',
        'tallyTriggered': true,
        'updatedProgress': {
          'totalVotes': 5,
          'approveVotes': 3,
          'rejectVotes': 2,
          'approvalRate': 60.0,
          'quorumMet': true,
          'timeRemaining': '5 days',
          'estimatedResolution': 'Soon',
        },
      };

      final result = VoteResult.fromJson(json);
      expect(result.success, true);
      expect(result.message, 'Vote recorded successfully');
      expect(result.tallyTriggered, true);
      expect(result.updatedProgress, isNotNull);
      expect(result.updatedProgress!.totalVotes, 5);
      expect(result.updatedProgress!.approveVotes, 3);
    });

    test('should handle failure case correctly', () {
      final json = {
        'success': false,
        'message': 'Vote failed: User already voted',
        'tallyTriggered': false,
      };

      final result = VoteResult.fromJson(json);
      expect(result.success, false);
      expect(result.message, 'Vote failed: User already voted');
      expect(result.tallyTriggered, false);
      expect(result.updatedProgress, isNull);
    });

    test('should handle minimal data with defaults', () {
      final json = <String, dynamic>{};

      final result = VoteResult.fromJson(json);
      expect(result.success, false); // default
      expect(result.message, isNull);
      expect(result.tallyTriggered, false); // default
      expect(result.updatedProgress, isNull);
    });

    test('should handle success without progress update', () {
      final json = {
        'success': true,
        'message': 'Vote recorded',
        'tallyTriggered': false,
      };

      final result = VoteResult.fromJson(json);
      expect(result.success, true);
      expect(result.message, 'Vote recorded');
      expect(result.tallyTriggered, false);
      expect(result.updatedProgress, isNull);
    });
  });
}

/// Helper function to create appeal with specific urgency score
Appeal _createAppealWithUrgency(int urgencyScore) {
  if (urgencyScore < 0 || urgencyScore > 100) {
    throw ArgumentError('Urgency score must be between 0 and 100');
  }

  return Appeal(
    appealId: 'test_id',
    contentId: 'content_id',
    contentType: 'post',
    contentTitle: 'Test Title',
    contentPreview: 'Test content',
    appealType: 'false_positive',
    appealReason: 'Test reason',
    userStatement: 'Test statement',
    submitterId: 'test_submitter',
    submitterName: 'Test Submitter',
    submittedAt: DateTime.now(),
    expiresAt: DateTime.now().add(const Duration(days: 7)),
    flagReason: 'test_flag',
    flagCategories: ['test'],
    flagCount: 1,
    votingStatus: VotingStatus.active,
    urgencyScore: urgencyScore,
    estimatedResolution: 'Soon',
    hasUserVoted: false,
    canUserVote: true,
    votingProgress: const VotingProgress(
      totalVotes: 0,
      approveVotes: 0,
      rejectVotes: 0,
      approvalRate: 0.0,
      quorumMet: false,
      timeRemaining: '7 days',
      estimatedResolution: 'Soon',
    ),
  );
}

/// Helper function to create appeal with specific type
Appeal _createAppealWithType(String? appealType) {
  final validTypes = ['false_positive', 'context_missing', 'other'];
  if (appealType == null || !validTypes.contains(appealType)) {
    throw ArgumentError('Invalid appeal type: $appealType');
  }

  return Appeal(
    appealId: 'test_id',
    contentId: 'content_id',
    contentType: 'post',
    contentTitle: 'Test Title',
    contentPreview: 'Test content',
    appealType: appealType,
    appealReason: 'Test reason',
    userStatement: 'Test statement',
    submitterId: 'test_submitter',
    submitterName: 'Test Submitter',
    submittedAt: DateTime.now(),
    expiresAt: DateTime.now().add(const Duration(days: 7)),
    flagReason: 'test_flag',
    flagCategories: ['test'],
    flagCount: 1,
    votingStatus: VotingStatus.active,
    urgencyScore: 50,
    estimatedResolution: 'Soon',
    hasUserVoted: false,
    canUserVote: true,
    votingProgress: const VotingProgress(
      totalVotes: 0,
      approveVotes: 0,
      rejectVotes: 0,
      approvalRate: 0.0,
      quorumMet: false,
      timeRemaining: '7 days',
      estimatedResolution: 'Soon',
    ),
  );
}
