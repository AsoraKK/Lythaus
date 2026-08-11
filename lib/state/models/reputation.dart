// ignore_for_file: public_member_api_docs

/// Server-issued reputation and account activity models.
///
/// This client deliberately does not derive reputation levels, bands, or
/// privileges from a local score or subscription tier.
class ReputationState {
  const ReputationState({
    required this.userId,
    required this.level,
    required this.levelName,
    required this.reputationStatus,
    required this.reputationBand,
    required this.policyVersion,
    required this.pillars,
    required this.promotionBlockers,
    this.evaluatedAt,
  });

  final String userId;
  final int level;
  final String levelName;
  final String reputationStatus;
  final String reputationBand;
  final String policyVersion;
  final Map<String, Object> pillars;
  final List<String> promotionBlockers;
  final DateTime? evaluatedAt;

  factory ReputationState.fromJson(Map<String, dynamic> json) {
    final level = _requiredBoundedInt(
      json['level'],
      'level',
      minimum: 0,
      maximum: 5,
    );
    final reputationLevel = _requiredBoundedInt(
      json['reputationLevel'],
      'reputationLevel',
      minimum: 0,
      maximum: 5,
    );
    if (level != reputationLevel) {
      throw const FormatException('Invalid private reputation response.');
    }
    return ReputationState(
      userId: _requiredString(json['userId'], 'userId'),
      level: level,
      levelName: _requiredString(json['levelName'], 'levelName'),
      reputationStatus: _requiredEnumString(
        json['reputationStatus'],
        'reputationStatus',
        const <String>{
          'active',
          'restricted',
          'suspended',
          'under_investigation',
        },
      ),
      reputationBand: _requiredEnumString(
        json['reputationBand'],
        'reputationBand',
        const <String>{'new', 'accountable', 'trusted', 'established'},
      ),
      policyVersion: _requiredString(json['policyVersion'], 'policyVersion'),
      pillars: _reputationPillars(json['pillars']),
      promotionBlockers: _stringList(json['promotionBlockers']),
      evaluatedAt: _nullableDate(json['evaluatedAt'], 'evaluatedAt'),
    );
  }
}

/// A reputation ledger record returned by `/api/reputation/me/ledger`.
class LedgerEntry {
  const LedgerEntry({
    required this.id,
    required this.eventType,
    required this.pillar,
    required this.impact,
    required this.status,
    required this.explanationCode,
    required this.policyVersion,
    required this.effectiveAt,
    required this.createdAt,
    this.contentId,
    this.appealId,
  });

  final String id;
  final String eventType;
  final String pillar;
  final String impact;
  final String status;
  final String explanationCode;
  final String policyVersion;
  final DateTime? effectiveAt;
  final DateTime createdAt;
  final String? contentId;
  final String? appealId;

  factory LedgerEntry.fromJson(Map<String, dynamic> json) {
    return LedgerEntry(
      id: json['id']?.toString() ?? '',
      eventType: json['eventType']?.toString() ?? 'unknown_event',
      pillar: json['pillar']?.toString() ?? 'unknown',
      impact: json['impact']?.toString() ?? '0',
      status: json['status']?.toString() ?? 'active',
      explanationCode: json['explanationCode']?.toString() ?? 'unavailable',
      policyVersion: json['policyVersion']?.toString() ?? 'unknown',
      effectiveAt: _parseDate(json['effectiveAt']),
      createdAt:
          _parseDate(json['createdAt']) ??
          DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      contentId: json['contentId']?.toString(),
      appealId: json['appealId']?.toString(),
    );
  }
}

enum ActivityCategory {
  all,
  account,
  content,
  social,
  reputation,
  moderation,
  appeals,
  privacy,
  rewards;

  String get label => switch (this) {
    ActivityCategory.all => 'All',
    ActivityCategory.account => 'Account',
    ActivityCategory.content => 'Content',
    ActivityCategory.social => 'Social',
    ActivityCategory.reputation => 'Reputation',
    ActivityCategory.moderation => 'Moderation',
    ActivityCategory.appeals => 'Appeals',
    ActivityCategory.privacy => 'Privacy',
    ActivityCategory.rewards => 'Rewards',
  };

  String? get queryValue => this == ActivityCategory.all ? null : name;

  static ActivityCategory? fromValue(String value) {
    final normalized = value.trim().toLowerCase();
    for (final category in ActivityCategory.values) {
      if (category.queryValue == normalized) {
        return category;
      }
    }
    return null;
  }
}

/// A cursor and category combination for a private activity page.
class ActivityPageQuery {
  const ActivityPageQuery({this.cursor, this.category = ActivityCategory.all});

  final String? cursor;
  final ActivityCategory category;

  @override
  bool operator ==(Object other) =>
      other is ActivityPageQuery &&
      other.cursor == cursor &&
      other.category == category;

  @override
  int get hashCode => Object.hash(cursor, category);
}

/// A private activity record returned by `/api/activity`.
class ActivityEntry {
  const ActivityEntry({
    required this.id,
    required this.category,
    required this.source,
    required this.title,
    required this.explanation,
    required this.result,
    this.reasonCode,
    required this.policyVersion,
    this.objectType,
    required this.appealable,
    required this.retentionDays,
    required this.createdAt,
    this.objectId,
    required this.reputationEffect,
    required this.retentionClass,
  });

  final String id;
  final String category;
  final String source;
  final String title;
  final String explanation;
  final String result;
  final String? reasonCode;
  final String policyVersion;
  final String? objectType;
  final bool appealable;
  final int retentionDays;
  final DateTime createdAt;
  final String? objectId;
  final String reputationEffect;
  final String retentionClass;

  factory ActivityEntry.fromJson(Map<String, dynamic> json) {
    return ActivityEntry(
      id: _requiredString(json['id'], 'activity.id'),
      category: _requiredEnumString(
        json['category'],
        'activity.category',
        const <String>{
          'account',
          'content',
          'social',
          'reputation',
          'moderation',
          'appeals',
          'privacy',
          'rewards',
        },
      ),
      source: _requiredEnumString(
        json['source'],
        'activity.source',
        const <String>{'public_api', 'admin_api', 'jobs', 'workflow', 'system'},
      ),
      title: _requiredString(json['title'], 'activity.title'),
      explanation: _requiredString(json['explanation'], 'activity.explanation'),
      result: _requiredEnumString(
        json['result'],
        'activity.result',
        const <String>{
          'succeeded',
          'failed',
          'withheld',
          'reversed',
          'pending',
        },
      ),
      reasonCode: _optionalString(json['reasonCode']),
      policyVersion: _requiredString(
        json['policyVersion'],
        'activity.policyVersion',
      ),
      objectType: _optionalString(json['objectType']),
      objectId: _optionalString(json['objectId']),
      reputationEffect: _requiredEnumString(
        json['reputationEffect'],
        'activity.reputationEffect',
        const <String>{'none', 'positive', 'negative', 'reversed', 'withheld'},
      ),
      appealable: _requiredBool(json['appealable'], 'activity.appealable'),
      retentionClass: _requiredEnumString(
        json['retentionClass'],
        'activity.retentionClass',
        const <String>{'ordinary', 'security', 'moderation'},
      ),
      retentionDays: _requiredRetentionDays(json['retentionDays']),
      createdAt: _requiredDate(json['createdAt'], 'activity.createdAt'),
    );
  }
}

/// A cursor page returned by a private activity endpoint.
class CursorPage<T> {
  const CursorPage({required this.items, this.nextCursor});

  final List<T> items;
  final String? nextCursor;

  bool get hasMore => nextCursor != null && nextCursor!.isNotEmpty;
}

List<String> _stringList(Object? value) {
  if (value is! List) {
    throw const FormatException('Invalid private reputation response.');
  }
  return value
      .whereType<String>()
      .where((entry) => entry.trim().isNotEmpty)
      .toList(growable: false);
}

Map<String, Object> _reputationPillars(Object? value) {
  if (value is! Map) {
    throw const FormatException('Invalid private reputation response.');
  }
  const requiredPillars = <String>[
    'accountability',
    'contribution',
    'conduct',
    'sourcing',
    'authenticity',
    'reviewReliability',
  ];
  final pillars = <String, Object>{};
  for (final pillar in requiredPillars) {
    final score = value[pillar];
    if (score is! num || !score.isFinite) {
      throw const FormatException('Invalid private reputation response.');
    }
    pillars[pillar] = score;
  }
  return Map<String, Object>.unmodifiable(pillars);
}

String _requiredString(Object? value, String field) {
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('Invalid $field.');
  }
  return value;
}

String? _optionalString(Object? value) =>
    value is String && value.trim().isNotEmpty ? value : null;

String _requiredEnumString(Object? value, String field, Set<String> allowed) {
  final parsed = _requiredString(value, field);
  if (!allowed.contains(parsed)) {
    throw FormatException('Invalid $field.');
  }
  return parsed;
}

int _requiredBoundedInt(
  Object? value,
  String field, {
  required int minimum,
  required int maximum,
}) {
  if (value is! int || value < minimum || value > maximum) {
    throw FormatException('Invalid $field.');
  }
  return value;
}

bool _requiredBool(Object? value, String field) {
  if (value is! bool) {
    throw FormatException('Invalid $field.');
  }
  return value;
}

int _requiredRetentionDays(Object? value) {
  if (value is! int || !const <int>{90, 365, 730}.contains(value)) {
    throw const FormatException('Invalid activity.retentionDays.');
  }
  return value;
}

DateTime _requiredDate(Object? value, String field) {
  if (value is! String) {
    throw FormatException('Invalid $field.');
  }
  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    throw FormatException('Invalid $field.');
  }
  return parsed;
}

DateTime? _nullableDate(Object? value, String field) =>
    value == null ? null : _requiredDate(value, field);

DateTime? _parseDate(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;
