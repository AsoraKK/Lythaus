// ignore_for_file: public_member_api_docs

/// LYTHAUS USER MODELS
///
/// 🎯 Purpose: User data models for authentication and profiles
/// Matches the native public API response structure.
/// 📊 Features: User profiles, authentication, statistics
/// 🏗️ Architecture: Immutable data classes with JSON serialization
library;

/// Editorial membership status per the Lythaus Editorial Framework.
/// Editorial is merit-based and earned; it is distinct from paid subscription tiers.
enum EditorialStatus {
  none, // Standard user, no editorial application
  applied, // Application submitted, pending review
  editorial; // Active editorial member (approved)

  static EditorialStatus fromString(String? value) => switch (value) {
    'applied' => EditorialStatus.applied,
    'editorial' => EditorialStatus.editorial,
    _ => EditorialStatus.none,
  };
}

/// User profile model returned by the native user profile endpoint.
class UserProfile {
  final String id;
  final String displayName;
  final String createdAt; // ISO string from backend
  final String tier; // 'freemium', 'premium', etc.
  final UserStats stats;
  final bool isOwnProfile;

  // Private fields only available for own profile
  final String? email;
  final String? lastLogin; // ISO string
  final EditorialStatus editorialStatus;

  const UserProfile({
    required this.id,
    required this.displayName,
    required this.createdAt,
    required this.tier,
    required this.stats,
    required this.isOwnProfile,
    this.email,
    this.lastLogin,
    this.editorialStatus = EditorialStatus.none,
  });

  /// Parse DateTime from ISO timestamp string
  DateTime get createdAtDateTime => DateTime.parse(createdAt);

  /// Parse last login DateTime if available
  DateTime? get lastLoginDateTime =>
      lastLogin != null ? DateTime.parse(lastLogin!) : null;

  /// Create a user profile from the native API JSON response.
  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: json['id'] as String,
      displayName: json['displayName'] as String,
      createdAt: json['createdAt'] as String,
      tier: json['tier'] as String,
      stats: UserStats.fromJson(json['stats'] as Map<String, dynamic>),
      isOwnProfile: json['isOwnProfile'] as bool,
      email: json['email'] as String?,
      lastLogin: json['lastLogin'] as String?,
      editorialStatus: EditorialStatus.fromString(
        json['editorialStatus'] as String?,
      ),
    );
  }

  /// Convert to JSON for API requests
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'displayName': displayName,
      'createdAt': createdAt,
      'tier': tier,
      'stats': stats.toJson(),
      'isOwnProfile': isOwnProfile,
      if (editorialStatus != EditorialStatus.none)
        'editorialStatus': editorialStatus.name,
      if (email != null) 'email': email,
      if (lastLogin != null) 'lastLogin': lastLogin,
    };
  }
}

/// User statistics returned by the native API.
class UserStats {
  final int postsCount;
  final int
  followersCount; // NOTE(lythaus-backlog): populate from social graph service once ready
  final int
  followingCount; // NOTE(lythaus-backlog): populate from social graph service once ready

  const UserStats({
    required this.postsCount,
    this.followersCount = 0,
    this.followingCount = 0,
  });

  factory UserStats.fromJson(Map<String, dynamic> json) {
    return UserStats(
      postsCount: json['postsCount'] as int,
      followersCount: json['followersCount'] as int? ?? 0,
      followingCount: json['followingCount'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'postsCount': postsCount,
      'followersCount': followersCount,
      'followingCount': followingCount,
    };
  }
}

/// User profile response from the native API.
class UserProfileResponse {
  final bool success;
  final UserProfile user;

  const UserProfileResponse({required this.success, required this.user});

  factory UserProfileResponse.fromJson(Map<String, dynamic> json) {
    return UserProfileResponse(
      success: json['success'] as bool,
      user: UserProfile.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}

/// Authentication response from the native email endpoint.
class AuthResponse {
  final bool success;
  final String token;
  final UserAuthData user;

  const AuthResponse({
    required this.success,
    required this.token,
    required this.user,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      success: json['success'] as bool,
      token: json['token'] as String,
      user: UserAuthData.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}

/// User data from authentication response
class UserAuthData {
  final String userId;
  final String email;
  final String displayName;
  final String role; // 'user', 'admin', 'moderator'
  final String tier; // 'freemium', 'premium', etc.

  const UserAuthData({
    required this.userId,
    required this.email,
    required this.displayName,
    required this.role,
    required this.tier,
  });

  factory UserAuthData.fromJson(Map<String, dynamic> json) {
    return UserAuthData(
      userId: json['userId'] as String,
      email: json['email'] as String,
      displayName: json['displayName'] as String,
      role: json['role'] as String,
      tier: json['tier'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'userId': userId,
      'email': email,
      'displayName': displayName,
      'role': role,
      'tier': tier,
    };
  }
}

/// Lightweight user info for general use
class UserInfo {
  final String id;
  final String displayName;
  final String role;
  final String tier;

  const UserInfo({
    required this.id,
    required this.displayName,
    required this.role,
    required this.tier,
  });

  /// Check if user is admin
  bool get isAdmin => role == 'admin';

  /// Check if user is moderator (or admin)
  bool get isModerator => role == 'moderator' || role == 'admin';

  /// Check if user has premium tier
  bool get isPremium => tier == 'premium';

  factory UserInfo.fromAuthData(UserAuthData authData) {
    return UserInfo(
      id: authData.userId,
      displayName: authData.displayName,
      role: authData.role,
      tier: authData.tier,
    );
  }

  factory UserInfo.fromJson(Map<String, dynamic> json) {
    return UserInfo(
      id: json['id'] as String,
      displayName: json['displayName'] as String,
      role: json['role'] as String,
      tier: json['tier'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {'id': id, 'displayName': displayName, 'role': role, 'tier': tier};
  }
}
