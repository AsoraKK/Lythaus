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
    return RewardRedemption(
      id: json['id'] as String,
      rewardId: json['rewardId'] as String,
      rewardLevel: (json['rewardLevel'] as num?)?.toInt() ?? 1,
      rewardTitle: json['rewardTitle'] as String? ?? 'Reward',
      redeemedAt:
          DateTime.tryParse(json['redeemedAt'] as String? ?? '') ??
          DateTime.now(),
      status: json['status'] as String? ?? 'redeemed',
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
