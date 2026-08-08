import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/domain/user_models.dart';

void main() {
  group('UserInfo', () {
    test('isAdmin returns true for admin role', () {
      const u = UserInfo(
        id: 'u1',
        displayName: 'Admin',
        role: 'admin',
        tier: 'premium',
      );
      expect(u.isAdmin, isTrue);
      expect(u.isModerator, isTrue); // admin is also moderator
      expect(u.isPremium, isTrue);
    });

    test('isModerator returns true for moderator role', () {
      const u = UserInfo(
        id: 'u2',
        displayName: 'Mod',
        role: 'moderator',
        tier: 'freemium',
      );
      expect(u.isAdmin, isFalse);
      expect(u.isModerator, isTrue);
      expect(u.isPremium, isFalse);
    });

    test('regular user flags are false', () {
      const u = UserInfo(
        id: 'u3',
        displayName: 'User',
        role: 'user',
        tier: 'freemium',
      );
      expect(u.isAdmin, isFalse);
      expect(u.isModerator, isFalse);
      expect(u.isPremium, isFalse);
    });

    test('fromAuthData creates UserInfo from UserAuthData', () {
      const authData = UserAuthData(
        userId: 'u4',
        email: 'bob@test.com',
        displayName: 'Bob',
        role: 'admin',
        tier: 'premium',
      );
      final info = UserInfo.fromAuthData(authData);
      expect(info.id, 'u4');
      expect(info.displayName, 'Bob');
      expect(info.role, 'admin');
      expect(info.tier, 'premium');
      expect(info.isAdmin, isTrue);
    });

    test('fromJson parses correctly', () {
      final info = UserInfo.fromJson({
        'id': 'u5',
        'displayName': 'Alice',
        'role': 'moderator',
        'tier': 'premium',
      });
      expect(info.id, 'u5');
      expect(info.displayName, 'Alice');
      expect(info.isModerator, isTrue);
      expect(info.isPremium, isTrue);
    });

    test('toJson serializes correctly', () {
      const u = UserInfo(
        id: 'u6',
        displayName: 'Test',
        role: 'user',
        tier: 'freemium',
      );
      final json = u.toJson();
      expect(json['id'], 'u6');
      expect(json['displayName'], 'Test');
      expect(json['role'], 'user');
      expect(json['tier'], 'freemium');
    });
  });

  group('UserAuthData', () {
    test('fromJson parses all fields', () {
      final data = UserAuthData.fromJson({
        'userId': 'u1',
        'email': 'a@b.com',
        'displayName': 'A',
        'role': 'admin',
        'tier': 'premium',
      });
      expect(data.userId, 'u1');
      expect(data.email, 'a@b.com');
      expect(data.displayName, 'A');
      expect(data.role, 'admin');
      expect(data.tier, 'premium');
    });

    test('toJson serializes all fields', () {
      const data = UserAuthData(
        userId: 'u2',
        email: 'b@c.com',
        displayName: 'B',
        role: 'user',
        tier: 'freemium',
      );
      final json = data.toJson();
      expect(json['userId'], 'u2');
      expect(json['email'], 'b@c.com');
    });
  });

  group('AuthResponse', () {
    test('fromJson parses correctly', () {
      final resp = AuthResponse.fromJson({
        'success': true,
        'token': 'tok123',
        'user': {
          'userId': 'u1',
          'email': 'a@b.com',
          'displayName': 'A',
          'role': 'admin',
          'tier': 'premium',
        },
      });
      expect(resp.success, isTrue);
      expect(resp.token, 'tok123');
      expect(resp.user.userId, 'u1');
    });
  });

  group('UserProfileResponse', () {
    test('fromJson parses correctly', () {
      final resp = UserProfileResponse.fromJson({
        'success': true,
        'user': {
          'id': 'u1',
          'displayName': 'Alice',
          'createdAt': '2025-01-01T00:00:00.000',
          'tier': 'premium',
          'stats': {'postsCount': 5},
          'isOwnProfile': true,
        },
      });
      expect(resp.success, isTrue);
      expect(resp.user.displayName, 'Alice');
    });
  });

  group('UserProfile', () {
    test('fromJson parses optional fields', () {
      final profile = UserProfile.fromJson({
        'id': 'u1',
        'displayName': 'Bob',
        'createdAt': '2025-01-01T00:00:00.000',
        'tier': 'freemium',
        'stats': {'postsCount': 10, 'followersCount': 5, 'followingCount': 3},
        'isOwnProfile': true,
        'email': 'bob@test.com',
        'lastLogin': '2025-06-01T12:00:00.000',
      });
      expect(profile.email, 'bob@test.com');
      expect(profile.lastLoginDateTime, isA<DateTime>());
    });

    test('toJson includes optional fields', () {
      const profile = UserProfile(
        id: 'u2',
        displayName: 'Bob',
        createdAt: '2025-01-01T00:00:00.000',
        tier: 'premium',
        stats: UserStats(postsCount: 1),
        isOwnProfile: false,
        email: 'a@b.com',
        lastLogin: '2025-06-01T00:00:00.000',
      );
      final json = profile.toJson();
      expect(json['email'], 'a@b.com');
      expect(json['lastLogin'], '2025-06-01T00:00:00.000');
    });

    test('toJson excludes null optional fields', () {
      const profile = UserProfile(
        id: 'u3',
        displayName: 'C',
        createdAt: '2025-01-01T00:00:00.000',
        tier: 'free',
        stats: UserStats(postsCount: 0),
        isOwnProfile: false,
      );
      final json = profile.toJson();
      expect(json.containsKey('email'), isFalse);
      expect(json.containsKey('lastLogin'), isFalse);
    });

    test('lastLoginDateTime returns null when not set', () {
      const profile = UserProfile(
        id: 'u4',
        displayName: 'D',
        createdAt: '2025-01-01T00:00:00.000',
        tier: 'free',
        stats: UserStats(postsCount: 0),
        isOwnProfile: false,
      );
      expect(profile.lastLoginDateTime, isNull);
    });

    test('createdAtDateTime parses ISO string', () {
      const profile = UserProfile(
        id: 'u5',
        displayName: 'E',
        createdAt: '2025-01-01T00:00:00.000',
        tier: 'free',
        stats: UserStats(postsCount: 0),
        isOwnProfile: false,
      );
      expect(profile.createdAtDateTime, DateTime(2025, 1, 1));
    });
  });

  group('UserStats', () {
    test('fromJson uses defaults for missing counts', () {
      final stats = UserStats.fromJson({'postsCount': 5});
      expect(stats.postsCount, 5);
      expect(stats.followersCount, 0);
      expect(stats.followingCount, 0);
    });

    test('toJson includes all counts', () {
      const stats = UserStats(
        postsCount: 10,
        followersCount: 5,
        followingCount: 3,
      );
      final json = stats.toJson();
      expect(json['postsCount'], 10);
      expect(json['followersCount'], 5);
      expect(json['followingCount'], 3);
    });
  });
}
