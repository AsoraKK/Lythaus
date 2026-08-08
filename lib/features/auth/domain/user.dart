// ignore_for_file: public_member_api_docs

// lib/features/auth/domain/user.dart

import 'package:lythaus/features/auth/domain/subscription_tier.dart';

/// User model representing an authenticated user in the Lythaus system
class User {
  const User({
    required this.id,
    required this.email,
    required this.role,
    required this.tier,
    required this.reputationScore,
    required this.createdAt,
    required this.lastLoginAt,
    this.subscriptionTier = SubscriptionTier.free,
    this.isTemporary = false,
    this.tokenExpires,
  });

  final String id;
  final String email;
  final UserRole role;
  final UserTier tier;

  /// Subscription tier. Prefer this over the legacy `tier` field.
  final SubscriptionTier subscriptionTier;
  final int reputationScore;
  final DateTime createdAt;
  final DateTime lastLoginAt;
  final bool isTemporary;
  final DateTime? tokenExpires;

  /// Create User from JSON response
  /// Handles both snake_case (from API) and camelCase (from cached data)
  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String? ?? json['sub'] as String,
      email: json['email'] as String,
      role: UserRole.fromString(json['role'] as String),
      tier: UserTier.fromString(json['tier'] as String),
      subscriptionTier: SubscriptionTier.fromString(
        json['subscriptionTier'] as String? ??
            json['subscription_tier'] as String?,
      ),
      // API sends reputation_score, cached data uses reputationScore
      reputationScore:
          json['reputation_score'] as int? ??
          json['reputationScore'] as int? ??
          0,
      createdAt: DateTime.parse(
        json['created_at'] as String? ?? json['createdAt'] as String,
      ),
      lastLoginAt: DateTime.parse(
        json['last_login_at'] as String? ?? json['lastLoginAt'] as String,
      ),
      isTemporary: json['isTemporary'] as bool? ?? false,
      tokenExpires: json['tokenExpires'] != null
          ? DateTime.parse(json['tokenExpires'] as String)
          : null,
    );
  }

  /// Convert User to JSON
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'role': role.name,
      'tier': tier.name,
      'subscriptionTier': subscriptionTier.value,
      'reputationScore': reputationScore,
      'createdAt': createdAt.toIso8601String(),
      'lastLoginAt': lastLoginAt.toIso8601String(),
      'isTemporary': isTemporary,
      'tokenExpires': tokenExpires?.toIso8601String(),
    };
  }

  /// Create a copy with updated fields
  User copyWith({
    String? id,
    String? email,
    UserRole? role,
    UserTier? tier,
    SubscriptionTier? subscriptionTier,
    int? reputationScore,
    DateTime? createdAt,
    DateTime? lastLoginAt,
    bool? isTemporary,
    DateTime? tokenExpires,
  }) {
    return User(
      id: id ?? this.id,
      email: email ?? this.email,
      role: role ?? this.role,
      tier: tier ?? this.tier,
      subscriptionTier: subscriptionTier ?? this.subscriptionTier,
      reputationScore: reputationScore ?? this.reputationScore,
      createdAt: createdAt ?? this.createdAt,
      lastLoginAt: lastLoginAt ?? this.lastLoginAt,
      isTemporary: isTemporary ?? this.isTemporary,
      tokenExpires: tokenExpires ?? this.tokenExpires,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is User &&
        other.id == id &&
        other.email == email &&
        other.role == role &&
        other.tier == tier &&
        other.subscriptionTier == subscriptionTier &&
        other.reputationScore == reputationScore &&
        other.createdAt == createdAt &&
        other.lastLoginAt == lastLoginAt &&
        other.isTemporary == isTemporary &&
        other.tokenExpires == tokenExpires;
  }

  @override
  int get hashCode {
    return Object.hash(
      id,
      email,
      role,
      tier,
      subscriptionTier,
      reputationScore,
      createdAt,
      lastLoginAt,
      isTemporary,
      tokenExpires,
    );
  }

  @override
  String toString() {
    return 'User(id: $id, email: $email, role: $role, tier: $tier, reputation: $reputationScore)';
  }
}

/// User roles in the Lythaus system
enum UserRole {
  user('user'),
  moderator('moderator'),
  admin('admin');

  const UserRole(this.name);
  final String name;

  static UserRole fromString(String value) {
    return UserRole.values.firstWhere(
      (role) => role.name == value.toLowerCase(),
      orElse: () => UserRole.user,
    );
  }
}

/// User tiers based on reputation and engagement
///
/// @Deprecated: Use [SubscriptionTier] for new code.
@Deprecated('Use SubscriptionTier instead')
enum UserTier {
  bronze('bronze'),
  silver('silver'),
  gold('gold'),
  platinum('platinum');

  const UserTier(this.name);
  final String name;

  static UserTier fromString(String value) {
    return UserTier.values.firstWhere(
      (tier) => tier.name == value.toLowerCase(),
      orElse: () => UserTier.bronze,
    );
  }
}
