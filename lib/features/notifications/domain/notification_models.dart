// ignore_for_file: public_member_api_docs

/// LYTHAUS NOTIFICATIONS - DOMAIN MODELS
///
/// Core models for notifications subsystem aligned with backend types
library;

enum NotificationCategory {
  social,
  safety,
  security,
  news,
  marketing;

  String toJson() => name.toUpperCase();

  static NotificationCategory fromJson(String json) {
    return NotificationCategory.values.firstWhere(
      (e) => e.name == json.toLowerCase(),
      orElse: () => NotificationCategory.social,
    );
  }
}

enum NotificationEventType {
  commentCreated,
  commentReply,
  postLiked,
  postReacted,
  userFollowed,
  followerPosted,
  moderationContentBlocked,
  moderationAppealDecided,
  securityLoginNewDevice,
  accountChange,
  newsAlert,
  marketingCampaign;

  String toJson() {
    // Convert camelCase to SCREAMING_SNAKE_CASE
    return name
        .replaceAllMapped(RegExp(r'[A-Z]'), (m) => '_${m.group(0)}')
        .toUpperCase();
  }

  static NotificationEventType fromJson(String json) {
    // Convert SCREAMING_SNAKE_CASE to camelCase
    final camelCase = json
        .toLowerCase()
        .split('_')
        .asMap()
        .entries
        .map(
          (e) => e.key == 0
              ? e.value
              : e.value[0].toUpperCase() + e.value.substring(1),
        )
        .join('');

    return NotificationEventType.values.firstWhere(
      (e) => e.name == camelCase,
      orElse: () => NotificationEventType.commentCreated,
    );
  }
}

class Notification {
  final String id;
  final String userId;
  final NotificationCategory category;
  final NotificationEventType eventType;
  final String title;
  final String body;
  final String? deeplink;
  final String? targetId;
  final String? targetType;
  final bool read;
  final String? readAt;
  final bool dismissed;
  final String? dismissedAt;
  final DateTime createdAt;

  const Notification({
    required this.id,
    required this.userId,
    required this.category,
    required this.eventType,
    required this.title,
    required this.body,
    this.deeplink,
    this.targetId,
    this.targetType,
    this.read = false,
    this.readAt,
    this.dismissed = false,
    this.dismissedAt,
    required this.createdAt,
  });

  factory Notification.fromJson(Map<String, dynamic> json) {
    return Notification(
      id: json['id'] as String,
      userId: json['userId'] as String,
      category: NotificationCategory.fromJson(json['category'] as String),
      eventType: NotificationEventType.fromJson(json['eventType'] as String),
      title: json['title'] as String,
      body: json['body'] as String,
      deeplink: json['deeplink'] as String?,
      targetId: json['targetId'] as String?,
      targetType: json['targetType'] as String?,
      read: json['read'] as bool? ?? false,
      readAt: json['readAt'] as String?,
      dismissed: json['dismissed'] as bool? ?? false,
      dismissedAt: json['dismissedAt'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'category': category.toJson(),
      'eventType': eventType.toJson(),
      'title': title,
      'body': body,
      if (deeplink != null) 'deeplink': deeplink,
      if (targetId != null) 'targetId': targetId,
      if (targetType != null) 'targetType': targetType,
      'read': read,
      if (readAt != null) 'readAt': readAt,
      'dismissed': dismissed,
      if (dismissedAt != null) 'dismissedAt': dismissedAt,
      'createdAt': createdAt.toIso8601String(),
    };
  }

  Notification copyWith({
    String? id,
    String? userId,
    NotificationCategory? category,
    NotificationEventType? eventType,
    String? title,
    String? body,
    String? deeplink,
    String? targetId,
    String? targetType,
    bool? read,
    String? readAt,
    bool? dismissed,
    String? dismissedAt,
    DateTime? createdAt,
  }) {
    return Notification(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      category: category ?? this.category,
      eventType: eventType ?? this.eventType,
      title: title ?? this.title,
      body: body ?? this.body,
      deeplink: deeplink ?? this.deeplink,
      targetId: targetId ?? this.targetId,
      targetType: targetType ?? this.targetType,
      read: read ?? this.read,
      readAt: readAt ?? this.readAt,
      dismissed: dismissed ?? this.dismissed,
      dismissedAt: dismissedAt ?? this.dismissedAt,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

class UserNotificationPreferences {
  final String userId;
  final String timezone;
  final QuietHours quietHours;
  final CategoryPreferences categories;
  final DateTime updatedAt;

  const UserNotificationPreferences({
    required this.userId,
    required this.timezone,
    required this.quietHours,
    required this.categories,
    required this.updatedAt,
  });

  factory UserNotificationPreferences.fromJson(Map<String, dynamic> json) {
    return UserNotificationPreferences(
      userId: json['userId'] as String,
      timezone: json['timezone'] as String,
      quietHours: QuietHours.fromJson(
        json['quietHours'] as Map<String, dynamic>,
      ),
      categories: CategoryPreferences.fromJson(
        json['categories'] as Map<String, dynamic>,
      ),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'userId': userId,
      'timezone': timezone,
      'quietHours': quietHours.toJson(),
      'categories': categories.toJson(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  UserNotificationPreferences copyWith({
    String? userId,
    String? timezone,
    QuietHours? quietHours,
    CategoryPreferences? categories,
    DateTime? updatedAt,
  }) {
    return UserNotificationPreferences(
      userId: userId ?? this.userId,
      timezone: timezone ?? this.timezone,
      quietHours: quietHours ?? this.quietHours,
      categories: categories ?? this.categories,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

class QuietHours {
  final List<bool> hours; // 24-element array (index = hour, value = isQuiet)

  const QuietHours(this.hours) : assert(hours.length == 24);

  factory QuietHours.fromJson(Map<String, dynamic> json) {
    final hoursList = json['hours'] as List<dynamic>;
    return QuietHours(hoursList.cast<bool>());
  }

  Map<String, dynamic> toJson() {
    return {'hours': hours};
  }

  bool isQuietAt(int hour) {
    if (hour < 0 || hour >= 24) return false;
    return hours[hour];
  }

  QuietHours withHourToggled(int hour) {
    final newHours = List<bool>.from(hours);
    newHours[hour] = !newHours[hour];
    return QuietHours(newHours);
  }

  /// Default quiet hours: 22:00 - 07:00 (10pm to 7am)
  static QuietHours get defaultQuietHours {
    final hours = List.filled(24, false);
    for (int i = 22; i < 24; i++) {
      hours[i] = true;
    }
    for (int i = 0; i < 7; i++) {
      hours[i] = true;
    }
    return QuietHours(hours);
  }
}

class CategoryPreferences {
  final bool social;
  final bool news;
  final bool marketing;

  const CategoryPreferences({
    required this.social,
    required this.news,
    required this.marketing,
  });

  factory CategoryPreferences.fromJson(Map<String, dynamic> json) {
    return CategoryPreferences(
      social: json['social'] as bool? ?? true,
      news: json['news'] as bool? ?? false,
      marketing: json['marketing'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {'social': social, 'news': news, 'marketing': marketing};
  }

  CategoryPreferences copyWith({bool? social, bool? news, bool? marketing}) {
    return CategoryPreferences(
      social: social ?? this.social,
      news: news ?? this.news,
      marketing: marketing ?? this.marketing,
    );
  }
}

class UserDeviceToken {
  final String id;
  final String userId;
  final String deviceId;
  final String pushToken;
  final String platform; // 'android', 'ios', or 'web'
  final String? label;
  final DateTime createdAt;
  final DateTime lastSeenAt;
  final DateTime? revokedAt;

  const UserDeviceToken({
    required this.id,
    required this.userId,
    required this.deviceId,
    required this.pushToken,
    required this.platform,
    this.label,
    required this.createdAt,
    required this.lastSeenAt,
    this.revokedAt,
  });

  bool get isActive => revokedAt == null;

  factory UserDeviceToken.fromJson(Map<String, dynamic> json) {
    return UserDeviceToken(
      id: json['id'] as String,
      userId: json['userId'] as String,
      deviceId: json['deviceId'] as String,
      pushToken: json['pushToken'] as String,
      platform: json['platform'] as String,
      label: json['label'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      lastSeenAt: DateTime.parse(json['lastSeenAt'] as String),
      revokedAt: json['revokedAt'] != null
          ? DateTime.parse(json['revokedAt'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'deviceId': deviceId,
      'pushToken': pushToken,
      'platform': platform,
      if (label != null) 'label': label,
      'createdAt': createdAt.toIso8601String(),
      'lastSeenAt': lastSeenAt.toIso8601String(),
      if (revokedAt != null) 'revokedAt': revokedAt!.toIso8601String(),
    };
  }
}

enum NotificationPermissionStatus {
  notDetermined,
  provisional,
  authorized,
  denied,
  restricted,
}
