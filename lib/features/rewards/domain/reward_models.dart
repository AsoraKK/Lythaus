// ignore_for_file: public_member_api_docs

class RewardOffer {
  const RewardOffer({
    required this.id,
    required this.rewardLevel,
    required this.title,
    required this.description,
    required this.partnerName,
    required this.locked,
    required this.redeemed,
    this.lockReason,
  });

  final String id;
  final int rewardLevel;
  final String title;
  final String description;
  final String partnerName;
  final bool locked;
  final bool redeemed;
  final String? lockReason;

  factory RewardOffer.fromJson(Map<String, dynamic> json) {
    return RewardOffer(
      id: json['id'] as String,
      rewardLevel: (json['rewardLevel'] as num?)?.toInt() ?? 1,
      title: json['title'] as String? ?? 'Reward',
      description: json['description'] as String? ?? '',
      partnerName: json['partnerName'] as String? ?? 'Partner',
      locked: json['locked'] as bool? ?? false,
      redeemed: json['redeemed'] as bool? ?? false,
      lockReason: json['lockReason'] as String?,
    );
  }
}

class RewardRedemption {
  const RewardRedemption({
    required this.id,
    required this.rewardId,
    required this.rewardLevel,
    required this.rewardTitle,
    required this.redeemedAt,
    required this.status,
  });

  final String id;
  final String rewardId;
  final int rewardLevel;
  final String rewardTitle;
  final DateTime redeemedAt;
  final String status;

  factory RewardRedemption.fromJson(Map<String, dynamic> json) {
    final rawRedeemedAt = json['redeemedAt'];
    final redeemedAt = rawRedeemedAt is String
        ? DateTime.tryParse(rawRedeemedAt)
        : null;
    final status = json['status'];
    if (redeemedAt == null || (status != 'redeemed' && status != 'revoked')) {
      throw const FormatException(
        'The server returned an invalid reward redemption receipt.',
      );
    }
    return RewardRedemption(
      id: json['id'] as String,
      rewardId: json['rewardId'] as String,
      rewardLevel: (json['rewardLevel'] as num?)?.toInt() ?? 1,
      rewardTitle: json['rewardTitle'] as String? ?? 'Reward',
      redeemedAt: redeemedAt,
      status: status as String,
    );
  }
}

class RewardsSnapshot {
  const RewardsSnapshot({
    required this.subscriptionTier,
    required this.reputationLevel,
    required this.reputationBand,
    required this.availableRewardLevels,
    required this.maxOptionsPerLevel,
    required this.redemptionStatus,
    required this.fraudRiskStatus,
    required this.offers,
    required this.redemptionHistory,
    required this.affiliateDisclosure,
  });

  final String subscriptionTier;
  final int reputationLevel;
  final String reputationBand;
  final List<int> availableRewardLevels;
  final int maxOptionsPerLevel;
  final String redemptionStatus;
  final String fraudRiskStatus;
  final List<RewardOffer> offers;
  final List<RewardRedemption> redemptionHistory;
  final String affiliateDisclosure;

  factory RewardsSnapshot.fromJson(Map<String, dynamic> json) {
    final levelsRaw =
        json['availableRewardLevels'] as List<dynamic>? ?? const [];
    final offersRaw = json['offers'] as List<dynamic>? ?? const [];
    final redemptionsRaw =
        json['redemptionHistory'] as List<dynamic>? ?? const [];

    return RewardsSnapshot(
      subscriptionTier: json['subscriptionTier'] as String? ?? 'free',
      reputationLevel: (json['reputationLevel'] as num?)?.toInt() ?? 0,
      reputationBand: json['reputationBand'] as String? ?? 'new',
      availableRewardLevels: levelsRaw
          .map((v) => (v as num?)?.toInt())
          .whereType<int>()
          .toList(),
      maxOptionsPerLevel: (json['maxOptionsPerLevel'] as num?)?.toInt() ?? 0,
      redemptionStatus: json['redemptionStatus'] as String? ?? 'active',
      fraudRiskStatus: json['fraudRiskStatus'] as String? ?? 'normal',
      offers: offersRaw
          .whereType<Map<dynamic, dynamic>>()
          .map((v) => RewardOffer.fromJson(Map<String, dynamic>.from(v)))
          .toList(),
      redemptionHistory: redemptionsRaw
          .whereType<Map<dynamic, dynamic>>()
          .map((v) => RewardRedemption.fromJson(Map<String, dynamic>.from(v)))
          .toList(),
      affiliateDisclosure: json['affiliateDisclosure'] as String? ?? '',
    );
  }
}

class MonthlyRewardsView {
  const MonthlyRewardsView({
    required this.state,
    required this.reasonCode,
    required this.effectiveMonth,
    required this.currentLevel,
    required this.sourceMonth,
    required this.sourceScore,
    this.snapshot = const MonthlyLevelSnapshot(state: 'unavailable'),
    this.selectionState = 'unavailable',
    this.selectionReasonCode,
    this.prospective,
  });

  final String state;
  final String? reasonCode;
  final String? effectiveMonth;
  final int? currentLevel;
  final String? sourceMonth;
  final int? sourceScore;
  final MonthlyLevelSnapshot snapshot;
  final String selectionState;
  final String? selectionReasonCode;
  final MonthlyProvisionalRewards? prospective;

  bool get hasConfirmedLevel =>
      snapshot.isConfirmed &&
      currentLevel == snapshot.level &&
      effectiveMonth == snapshot.effectiveMonth &&
      sourceMonth == snapshot.sourceMonth &&
      sourceScore == snapshot.sourceScore;

  bool get rewardsReady =>
      hasConfirmedLevel && state == 'ready' && selectionState == 'ready';

  factory MonthlyRewardsView.fromJson(Map<String, dynamic> json) {
    final selection = _monthlyObject(json['selection']);
    return MonthlyRewardsView(
      state: _monthlyString(json['state']) ?? 'pending',
      reasonCode: _monthlyString(json['reasonCode']),
      effectiveMonth: _monthlyMonth(json['effectiveMonth']),
      currentLevel: _monthlyInteger(json['currentLevel'], 1, 5),
      sourceMonth: _monthlyMonth(json['sourceMonth']),
      sourceScore: _monthlyInteger(json['sourceScore'], 0, 13650),
      snapshot: MonthlyLevelSnapshot.fromResponse(json),
      selectionState: _monthlyString(selection['state']) ?? 'unavailable',
      selectionReasonCode: _monthlyString(selection['reasonCode']),
      prospective: MonthlyProvisionalRewards.fromJson(
        _monthlyObject(json['prospective']),
      ),
    );
  }
}

class MonthlyProvisionalRewards {
  const MonthlyProvisionalRewards({
    required this.sourceMonth,
    required this.effectiveMonth,
    required this.sourceScore,
    required this.level,
  });

  final String sourceMonth;
  final String effectiveMonth;
  final int sourceScore;
  final int level;

  static MonthlyProvisionalRewards? fromJson(Map<String, dynamic> value) {
    final sourceMonth = _monthlyMonth(value['sourceMonth']);
    final effectiveMonth = _monthlyMonth(value['effectiveMonth']);
    final score = _monthlyInteger(value['sourceScore'], 0, 13650);
    final level = _monthlyInteger(value['level'], 1, 5);
    final expectedLevel = score == null
        ? null
        : score >= 10000
        ? 5
        : score >= 6000
        ? 4
        : score >= 3000
        ? 3
        : score >= 1000
        ? 2
        : 1;
    if (value['policyVersion'] != 'lythaus-monthly-rewards-v0.5-candidate' ||
        value['state'] != 'provisional' ||
        value['redeemable'] != false ||
        value['runtimeActivationAllowed'] != false ||
        value['appliedPoints'] != 0 ||
        value['finalMaximumSourceMonth'] != null ||
        value['maximumForCurrentComponents'] != 13650 ||
        sourceMonth == null ||
        effectiveMonth != _followingMonthlyMonth(sourceMonth) ||
        score == null ||
        level != expectedLevel) {
      return null;
    }
    return MonthlyProvisionalRewards(
      sourceMonth: sourceMonth,
      effectiveMonth: effectiveMonth!,
      sourceScore: score,
      level: level!,
    );
  }
}

class MonthlyLevelSnapshot {
  const MonthlyLevelSnapshot({
    required this.state,
    this.reasonCode,
    this.effectiveMonth,
    this.sourceMonth,
    this.sourceScore,
    this.level,
    this.policyVersion,
    this.maximumSourceMonth,
    this.preparationOnly = false,
  });

  final String state;
  final String? reasonCode;
  final String? effectiveMonth;
  final String? sourceMonth;
  final int? sourceScore;
  final int? level;
  final String? policyVersion;
  final int? maximumSourceMonth;
  final bool preparationOnly;

  bool get isAssessed =>
      sourceMonth != null &&
      effectiveMonth != null &&
      sourceScore != null &&
      level != null &&
      maximumSourceMonth != null;

  bool get isConfirmed =>
      isAssessed &&
      state == 'confirmed' &&
      policyVersion == _monthlyV1Policy &&
      !preparationOnly;

  bool get isShadow => isAssessed && state == 'shadow';

  factory MonthlyLevelSnapshot.fromResponse(Map<String, dynamic> response) {
    final prepared =
        response['responseVersion'] ==
            'monthly-rewards-response-v2-preparation' &&
        response['responseKind'] == 'monthly_rewards' &&
        response['policyVersion'] == _monthlyV2Policy &&
        response['catalogueHash'] ==
            '26213abccce99ee51be6c0623406c28aaa7d39ed3ea3b4ac630b7cffd859db67' &&
        response['dataVersion'] == 2 &&
        response['preparationOnly'] == true &&
        response['runtimeActivationAllowed'] == false &&
        response['appliedPoints'] == 0 &&
        response['maximumSourceMonth'] == 13650;
    if (response['responseVersion'] != null && !prepared) {
      return const MonthlyLevelSnapshot(state: 'unavailable');
    }
    final snapshot = _monthlyObject(
      response[prepared ? 'snapshotProjection' : 'snapshot'],
    );
    final policy = prepared
        ? _monthlyV2Policy
        : _monthlyString(snapshot['policyVersion']);
    final maximum = prepared
        ? 13650
        : policy == _monthlyV1Policy &&
              (snapshot['maximumSourceMonth'] == null ||
                  snapshot['maximumSourceMonth'] == 13500)
        ? 13500
        : null;
    final sourceMonth = _monthlyMonth(snapshot['sourceMonth']);
    final effectiveMonth = _monthlyMonth(snapshot['effectiveMonth']);
    final assessed =
        (snapshot['state'] == 'shadow' || snapshot['state'] == 'confirmed') &&
        snapshot['levelKind'] == null &&
        maximum != null &&
        sourceMonth != null &&
        effectiveMonth == _followingMonthlyMonth(sourceMonth) &&
        effectiveMonth == _monthlyMonth(response['effectiveMonth']);
    return MonthlyLevelSnapshot(
      state: _monthlyString(snapshot['state']) ?? 'unavailable',
      reasonCode: _monthlyString(snapshot['reasonCode']),
      effectiveMonth: effectiveMonth,
      sourceMonth: assessed ? sourceMonth : null,
      sourceScore: assessed
          ? _monthlyInteger(snapshot['sourceScore'], 0, maximum)
          : null,
      level: assessed ? _monthlyInteger(snapshot['level'], 1, 5) : null,
      policyVersion: policy,
      maximumSourceMonth: maximum,
      preparationOnly:
          prepared ||
          snapshot['preparationOnly'] == true ||
          snapshot['runtimeActivationAllowed'] == false ||
          response['preparationOnly'] == true ||
          response['runtimeActivationAllowed'] == false,
    );
  }
}

const _monthlyV1Policy = 'lythaus-monthly-rewards-2026-10-v1';
const _monthlyV2Policy = 'lythaus-monthly-rewards-2026-10-v2';

Map<String, dynamic> _monthlyObject(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const <String, dynamic>{};

String? _monthlyString(Object? value) => value is String ? value : null;

int? _monthlyInteger(Object? value, int minimum, int? maximum) =>
    value is int && maximum != null && value >= minimum && value <= maximum
    ? value
    : null;

String? _monthlyMonth(Object? value) =>
    value is String && RegExp(r'^[1-9]\d{3}-(0[1-9]|1[0-2])$').hasMatch(value)
    ? value
    : null;

String _followingMonthlyMonth(String month) {
  final parts = month.split('-');
  final date = DateTime.utc(int.parse(parts[0]), int.parse(parts[1]) + 1);
  return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}';
}
