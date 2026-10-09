// ignore_for_file: public_member_api_docs

import 'package:flutter/foundation.dart';

const Set<String> _visibilityValues = {
  'public_expanded',
  'public_minimal',
  'private',
};

@immutable
class PublicUser {
  final String id;
  final String displayName;
  final String? handle;
  final String? avatarUrl;
  final String? bio;
  final String tier;
  final String trustPassportVisibility;
  final int reputationScore;
  final bool journalistVerified;
  final List<String> badges;

  const PublicUser({
    required this.id,
    required this.displayName,
    this.handle,
    this.avatarUrl,
    this.bio,
    required this.tier,
    this.trustPassportVisibility = 'public_minimal',
    this.reputationScore = 0,
    this.journalistVerified = false,
    this.badges = const [],
  });

  /// Returns a real account handle, when the server has one.
  String? get handleLabel {
    final value = handle?.trim();
    if (value == null || value.isEmpty) return null;
    return value.startsWith('@') ? value : '@$value';
  }

  factory PublicUser.fromJson(Map<String, dynamic> json) {
    final visibility = json['trustPassportVisibility'] as String?;
    final reputation = json['reputation'];
    return PublicUser(
      id: json['id'] as String,
      displayName: json['displayName'] as String,
      handle: (json['handle'] as String?) ?? (json['username'] as String?),
      avatarUrl: json['avatarUrl'] as String?,
      bio: json['bio'] as String?,
      tier:
          json['subscriptionTier'] as String? ??
          json['tier'] as String? ??
          'free',
      trustPassportVisibility: _visibilityValues.contains(visibility)
          ? visibility!
          : 'public_minimal',
      reputationScore:
          (json['reputationScore'] as num?)?.toInt() ??
          (reputation is num ? reputation.toInt() : 0),
      journalistVerified: json['journalistVerified'] as bool? ?? false,
      badges:
          (json['badges'] as List<dynamic>?)?.whereType<String>().toList() ??
          const [],
    );
  }
}
