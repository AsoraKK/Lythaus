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
  final Map<String, String> pillars;
  final List<String> promotionBlockers;
  final DateTime? evaluatedAt;

  factory ReputationState.fromJson(Map<String, dynamic> json) {
    final level =
        int.tryParse(
          (json['level'] ?? json['reputationLevel'] ?? 0).toString(),
        ) ??
        0;
    final rawPillars = json['pillars'];
    return ReputationState(
      userId: json['userId']?.toString() ?? '',
      level: level,
      levelName: json['levelName']?.toString() ?? 'Level $level',
      reputationStatus: json['reputationStatus']?.toString() ?? 'active',
      reputationBand: json['reputationBand']?.toString() ?? 'Unspecified',
      policyVersion: json['policyVersion']?.toString() ?? 'unknown',
      pillars: rawPillars is Map
          ? Map<String, String>.fromEntries(
              rawPillars.entries.map(
                (entry) =>
                    MapEntry(entry.key.toString(), entry.value.toString()),
              ),
            )
          : const <String, String>{},
      promotionBlockers: _stringList(json['promotionBlockers']),
      evaluatedAt: _parseDate(json['evaluatedAt']),
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

/// A private activity record returned by `/api/activity`.
class ActivityEntry {
  const ActivityEntry({
    required this.id,
    required this.title,
    required this.explanation,
    required this.result,
    required this.reasonCode,
    required this.policyVersion,
    required this.objectType,
    required this.appealable,
    required this.createdAt,
    this.objectId,
    this.reputationEffect,
    this.retentionClass,
    this.metadata = const <String, dynamic>{},
  });

  final String id;
  final String title;
  final String explanation;
  final String result;
  final String reasonCode;
  final String policyVersion;
  final String objectType;
  final bool appealable;
  final DateTime createdAt;
  final String? objectId;
  final String? reputationEffect;
  final String? retentionClass;
  final Map<String, dynamic> metadata;

  factory ActivityEntry.fromJson(Map<String, dynamic> json) {
    final rawMetadata = json['metadata'];
    return ActivityEntry(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Account activity',
      explanation: json['explanation']?.toString() ?? '',
      result: json['result']?.toString() ?? 'recorded',
      reasonCode: json['reasonCode']?.toString() ?? 'unavailable',
      policyVersion: json['policyVersion']?.toString() ?? 'unknown',
      objectType: json['objectType']?.toString() ?? 'account',
      objectId: json['objectId']?.toString(),
      reputationEffect: json['reputationEffect']?.toString(),
      appealable: json['appealable'] as bool? ?? false,
      retentionClass: json['retentionClass']?.toString(),
      metadata: rawMetadata is Map
          ? Map<String, dynamic>.from(rawMetadata)
          : const <String, dynamic>{},
      createdAt:
          _parseDate(json['createdAt']) ??
          DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
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
    return const <String>[];
  }
  return value.map((entry) => entry.toString()).toList();
}

DateTime? _parseDate(Object? value) =>
    value == null ? null : DateTime.tryParse(value.toString());
