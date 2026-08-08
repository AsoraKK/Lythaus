import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ModerationQueueItem', () {
    test('fromJson creates instance with all fields', () {
      final json = <String, dynamic>{
        'id': 'case-123',
        'type': 'flag',
        'contentId': 'post-456',
        'contentType': 'post',
        'contentPreview': 'This is sample content...',
        'createdAt': '2024-01-15T10:30:00Z',
        'severity': 'high',
        'status': 'pending',
        'queue': 'default',
        'reportCount': 5,
        'communityVotes': 12,
        'isEscalated': true,
        'contentTitle': 'Sample Post Title',
        'authorHandle': '@user123',
        'thumbnailUrl': 'https://example.com/thumb.jpg',
        'aiRiskBand': 'high_risk',
        'aiSignal': 'harassment',
        'isPolicyTest': false,
      };

      final item = ModerationQueueItem.fromJson(json);

      expect(item.id, 'case-123');
      expect(item.type, ModerationItemType.flag);
      expect(item.contentId, 'post-456');
      expect(item.contentType, 'post');
      expect(item.contentPreview, 'This is sample content...');
      expect(item.createdAt, DateTime.parse('2024-01-15T10:30:00Z'));
      expect(item.severity, ModerationSeverityLevel.high);
      expect(item.status, 'pending');
      expect(item.queue, 'default');
      expect(item.reportCount, 5);
      expect(item.communityVotes, 12);
      expect(item.isEscalated, isTrue);
      expect(item.contentTitle, 'Sample Post Title');
      expect(item.authorHandle, '@user123');
      expect(item.thumbnailUrl, 'https://example.com/thumb.jpg');
      expect(item.aiRiskBand, 'high_risk');
      expect(item.aiSignal, 'harassment');
      expect(item.isPolicyTest, isFalse);
    });

    test('fromJson handles legacy field names', () {
      final json = <String, dynamic>{
        'caseId': 'case-789',
        'type': 'appeal',
        'contentId': 'post-123',
        'snippet': 'Legacy content preview',
        'created_at': '2024-01-15T10:30:00Z',
        'severity': 'medium',
        'flags': 3,
        'appealVotes': 7,
        'escalated': true,
        'aiLabel': 'moderate_risk',
      };

      final item = ModerationQueueItem.fromJson(json);

      expect(item.id, 'case-789');
      expect(item.type, ModerationItemType.appeal);
      expect(item.contentPreview, 'Legacy content preview');
      expect(item.severity, ModerationSeverityLevel.medium);
      expect(item.reportCount, 3);
      expect(item.communityVotes, 7);
      expect(item.isEscalated, isTrue);
      expect(item.aiRiskBand, 'moderate_risk');
    });

    test('fromJson handles missing fields with defaults', () {
      final json = <String, dynamic>{
        'id': 'case-minimal',
        'type': 'flag',
        'contentId': 'post-min',
      };

      final item = ModerationQueueItem.fromJson(json);

      expect(item.id, 'case-minimal');
      expect(item.type, ModerationItemType.flag);
      expect(item.contentId, 'post-min');
      expect(item.contentType, 'unknown');
      expect(item.contentPreview, '');
      expect(item.createdAt, isA<DateTime>());
      expect(item.severity, ModerationSeverityLevel.unknown);
      expect(item.status, 'unknown');
      expect(item.queue, 'default');
      expect(item.reportCount, 0);
      expect(item.communityVotes, 0);
      expect(item.isEscalated, isFalse);
      expect(item.contentTitle, isNull);
      expect(item.authorHandle, isNull);
      expect(item.thumbnailUrl, isNull);
      expect(item.isPolicyTest, isFalse);
    });

    test('fromJson handles invalid createdAt', () {
      final json = <String, dynamic>{
        'id': 'case-invalid-date',
        'type': 'flag',
        'contentId': 'post-123',
        'createdAt': 'not-a-date',
      };

      final item = ModerationQueueItem.fromJson(json);

      expect(item.createdAt, isA<DateTime>());
    });

    test('parseItemType handles various inputs', () {
      expect(
        ModerationQueueItem.parseItemType('appeal'),
        ModerationItemType.appeal,
      );
      expect(
        ModerationQueueItem.parseItemType('APPEAL'),
        ModerationItemType.appeal,
      );
      expect(
        ModerationQueueItem.parseItemType('Appeal'),
        ModerationItemType.appeal,
      );
      expect(
        ModerationQueueItem.parseItemType('flag'),
        ModerationItemType.flag,
      );
      expect(
        ModerationQueueItem.parseItemType('FLAG'),
        ModerationItemType.flag,
      );
      expect(
        ModerationQueueItem.parseItemType('unknown'),
        ModerationItemType.flag,
      );
      expect(ModerationQueueItem.parseItemType(null), ModerationItemType.flag);
    });

    test('parseSeverity handles various inputs', () {
      expect(
        ModerationQueueItem.parseSeverity('high'),
        ModerationSeverityLevel.high,
      );
      expect(
        ModerationQueueItem.parseSeverity('HIGH'),
        ModerationSeverityLevel.high,
      );
      expect(
        ModerationQueueItem.parseSeverity('High'),
        ModerationSeverityLevel.high,
      );
      expect(
        ModerationQueueItem.parseSeverity('medium'),
        ModerationSeverityLevel.medium,
      );
      expect(
        ModerationQueueItem.parseSeverity('MEDIUM'),
        ModerationSeverityLevel.medium,
      );
      expect(
        ModerationQueueItem.parseSeverity('low'),
        ModerationSeverityLevel.low,
      );
      expect(
        ModerationQueueItem.parseSeverity('LOW'),
        ModerationSeverityLevel.low,
      );
      expect(
        ModerationQueueItem.parseSeverity('unknown'),
        ModerationSeverityLevel.unknown,
      );
      expect(
        ModerationQueueItem.parseSeverity('invalid'),
        ModerationSeverityLevel.unknown,
      );
      expect(
        ModerationQueueItem.parseSeverity(null),
        ModerationSeverityLevel.unknown,
      );
    });

    test('hasHighSeverity returns true for high severity', () {
      final item = ModerationQueueItem(
        id: 'case-1',
        type: ModerationItemType.flag,
        contentId: 'post-1',
        contentType: 'post',
        contentPreview: 'Test',
        createdAt: DateTime.parse('2024-01-15T10:30:00Z'),
        severity: ModerationSeverityLevel.high,
        status: 'pending',
        queue: 'default',
        reportCount: 1,
        communityVotes: 0,
        isEscalated: false,
      );

      expect(item.hasHighSeverity, isTrue);
    });

    test('hasHighSeverity returns false for non-high severity', () {
      final item = ModerationQueueItem(
        id: 'case-1',
        type: ModerationItemType.flag,
        contentId: 'post-1',
        contentType: 'post',
        contentPreview: 'Test',
        createdAt: DateTime.parse('2024-01-15T10:30:00Z'),
        severity: ModerationSeverityLevel.medium,
        status: 'pending',
        queue: 'default',
        reportCount: 1,
        communityVotes: 0,
        isEscalated: false,
      );

      expect(item.hasHighSeverity, isFalse);
    });

    test('toJson serializes all fields', () {
      final createdAt = DateTime.utc(2024, 1, 15, 10, 30);
      final item = ModerationQueueItem(
        id: 'case-123',
        type: ModerationItemType.appeal,
        contentId: 'post-456',
        contentType: 'post',
        contentPreview: 'Content preview',
        createdAt: createdAt,
        severity: ModerationSeverityLevel.high,
        status: 'pending',
        queue: 'priority',
        reportCount: 10,
        communityVotes: 25,
        isEscalated: true,
        contentTitle: 'Title',
        authorHandle: '@user',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        aiRiskBand: 'high_risk',
        aiSignal: 'spam',
        isPolicyTest: true,
      );

      final json = item.toJson();

      expect(json['id'], 'case-123');
      expect(json['type'], 'appeal');
      expect(json['contentId'], 'post-456');
      expect(json['contentType'], 'post');
      expect(json['contentPreview'], 'Content preview');
      expect(json['createdAt'], '2024-01-15T10:30:00.000Z');
      expect(json['severity'], 'high');
      expect(json['status'], 'pending');
      expect(json['queue'], 'priority');
      expect(json['reportCount'], 10);
      expect(json['communityVotes'], 25);
      expect(json['isEscalated'], isTrue);
      expect(json['contentTitle'], 'Title');
      expect(json['authorHandle'], '@user');
      expect(json['thumbnailUrl'], 'https://example.com/thumb.jpg');
      expect(json['aiRiskBand'], 'high_risk');
      expect(json['aiSignal'], 'spam');
      expect(json['isPolicyTest'], isTrue);
    });

    test('toJson includes null fields', () {
      final item = ModerationQueueItem(
        id: 'case-1',
        type: ModerationItemType.flag,
        contentId: 'post-1',
        contentType: 'post',
        contentPreview: 'Test',
        createdAt: DateTime.utc(2024, 1, 15),
        severity: ModerationSeverityLevel.low,
        status: 'pending',
        queue: 'default',
        reportCount: 1,
        communityVotes: 0,
        isEscalated: false,
      );

      final json = item.toJson();

      expect(json['contentTitle'], isNull);
      expect(json['authorHandle'], isNull);
      expect(json['thumbnailUrl'], isNull);
      expect(json['aiRiskBand'], isNull);
      expect(json['aiSignal'], isNull);
    });
  });

  group('ModerationQueuePagination', () {
    test('fromJson creates instance with all fields', () {
      final json = <String, dynamic>{
        'page': 3,
        'pageSize': 50,
        'total': 150,
        'hasMore': true,
      };

      final pagination = ModerationQueuePagination.fromJson(json);

      expect(pagination.page, 3);
      expect(pagination.pageSize, 50);
      expect(pagination.total, 150);
      expect(pagination.hasMore, isTrue);
    });

    test('fromJson handles null input with defaults', () {
      final pagination = ModerationQueuePagination.fromJson(null);

      expect(pagination.page, 1);
      expect(pagination.pageSize, 20);
      expect(pagination.total, 0);
      expect(pagination.hasMore, isFalse);
    });

    test('fromJson handles missing fields with defaults', () {
      final json = <String, dynamic>{};

      final pagination = ModerationQueuePagination.fromJson(json);

      expect(pagination.page, 1);
      expect(pagination.pageSize, 20);
      expect(pagination.total, 0);
      expect(pagination.hasMore, isFalse);
    });

    test('fromJson handles partial fields', () {
      final json = <String, dynamic>{'page': 2, 'total': 100};

      final pagination = ModerationQueuePagination.fromJson(json);

      expect(pagination.page, 2);
      expect(pagination.pageSize, 20);
      expect(pagination.total, 100);
      expect(pagination.hasMore, isFalse);
    });
  });

  group('ModerationQueueResponse', () {
    test('fromJson creates response with items and pagination', () {
      final json = <String, dynamic>{
        'items': [
          <String, dynamic>{
            'id': 'case-1',
            'type': 'flag',
            'contentId': 'post-1',
            'contentType': 'post',
            'contentPreview': 'Content 1',
            'createdAt': '2024-01-15T10:00:00Z',
            'severity': 'high',
            'status': 'pending',
            'queue': 'default',
            'reportCount': 2,
            'communityVotes': 5,
            'isEscalated': false,
          },
          <String, dynamic>{
            'id': 'case-2',
            'type': 'appeal',
            'contentId': 'post-2',
            'contentType': 'comment',
            'contentPreview': 'Content 2',
            'createdAt': '2024-01-15T11:00:00Z',
            'severity': 'medium',
            'status': 'reviewed',
            'queue': 'appeals',
            'reportCount': 1,
            'communityVotes': 3,
            'isEscalated': true,
          },
        ],
        'pagination': <String, dynamic>{
          'page': 1,
          'pageSize': 20,
          'total': 2,
          'hasMore': false,
        },
      };

      final response = ModerationQueueResponse.fromJson(json);

      expect(response.items.length, 2);
      expect(response.items[0].id, 'case-1');
      expect(response.items[1].id, 'case-2');
      expect(response.pagination.page, 1);
      expect(response.pagination.total, 2);
    });

    test('fromJson handles legacy data field name', () {
      final json = <String, dynamic>{
        'data': [
          <String, dynamic>{
            'id': 'case-legacy',
            'type': 'flag',
            'contentId': 'post-legacy',
            'contentType': 'post',
            'contentPreview': 'Legacy content',
            'createdAt': '2024-01-15T10:00:00Z',
            'severity': 'low',
            'status': 'pending',
            'queue': 'default',
            'reportCount': 1,
            'communityVotes': 0,
            'isEscalated': false,
          },
        ],
        'pagination': <String, dynamic>{
          'page': 1,
          'pageSize': 20,
          'total': 1,
          'hasMore': false,
        },
      };

      final response = ModerationQueueResponse.fromJson(json);

      expect(response.items.length, 1);
      expect(response.items[0].id, 'case-legacy');
    });

    test('fromJson handles empty items list', () {
      final json = <String, dynamic>{
        'items': <Map<String, dynamic>>[],
        'pagination': <String, dynamic>{
          'page': 1,
          'pageSize': 20,
          'total': 0,
          'hasMore': false,
        },
      };

      final response = ModerationQueueResponse.fromJson(json);

      expect(response.items, isEmpty);
      expect(response.pagination.total, 0);
    });

    test('fromJson handles missing items with empty list', () {
      final json = <String, dynamic>{
        'pagination': <String, dynamic>{
          'page': 1,
          'pageSize': 20,
          'total': 0,
          'hasMore': false,
        },
      };

      final response = ModerationQueueResponse.fromJson(json);

      expect(response.items, isEmpty);
    });
  });
}
