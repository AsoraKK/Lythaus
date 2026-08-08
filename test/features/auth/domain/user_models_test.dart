import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/domain/user_models.dart';

void main() {
  test('UserStats fromJson applies defaults and toJson', () {
    final stats = UserStats.fromJson({'postsCount': 5});
    expect(stats.postsCount, 5);
    expect(stats.followersCount, 0);
    expect(stats.followingCount, 0);

    final json = stats.toJson();
    expect(json['postsCount'], 5);
    expect(json['followersCount'], 0);
    expect(json['followingCount'], 0);
  });

  test('UserProfile fromJson/toJson handles optional fields', () {
    final json = {
      'id': 'user-1',
      'displayName': 'Ada',
      'createdAt': '2024-01-01T00:00:00Z',
      'tier': 'premium',
      'stats': {'postsCount': 2, 'followersCount': 10, 'followingCount': 3},
      'isOwnProfile': true,
      'email': 'ada@example.com',
      'lastLogin': '2024-01-02T00:00:00Z',
    };

    final profile = UserProfile.fromJson(json);
    expect(profile.id, 'user-1');
    expect(profile.displayName, 'Ada');
    expect(profile.tier, 'premium');
    expect(profile.stats.postsCount, 2);
    expect(profile.createdAtDateTime, DateTime.parse('2024-01-01T00:00:00Z'));
    expect(profile.lastLoginDateTime, DateTime.parse('2024-01-02T00:00:00Z'));

    final serialized = profile.toJson();
    expect(serialized['email'], 'ada@example.com');
    expect(serialized['lastLogin'], '2024-01-02T00:00:00Z');
  });

  test('UserProfileResponse and AuthResponse parse nested user data', () {
    final profileResponse = UserProfileResponse.fromJson({
      'success': true,
      'user': {
        'id': 'user-2',
        'displayName': 'Sam',
        'createdAt': '2024-02-01T00:00:00Z',
        'tier': 'freemium',
        'stats': {'postsCount': 1},
        'isOwnProfile': false,
      },
    });
    expect(profileResponse.success, true);
    expect(profileResponse.user.displayName, 'Sam');

    final authResponse = AuthResponse.fromJson({
      'success': true,
      'token': 'jwt-token',
      'user': {
        'userId': 'user-3',
        'email': 'sam@example.com',
        'displayName': 'Sam',
        'role': 'user',
        'tier': 'premium',
      },
    });
    expect(authResponse.token, 'jwt-token');
    expect(authResponse.user.role, 'user');
  });

  test('UserInfo helpers expose role and tier flags', () {
    const authData = UserAuthData(
      userId: 'user-4',
      email: 'admin@example.com',
      displayName: 'Admin',
      role: 'admin',
      tier: 'premium',
    );
    final info = UserInfo.fromAuthData(authData);

    expect(info.isAdmin, true);
    expect(info.isModerator, true);
    expect(info.isPremium, true);

    final json = info.toJson();
    expect(json['role'], 'admin');
    expect(json['tier'], 'premium');
  });
}
