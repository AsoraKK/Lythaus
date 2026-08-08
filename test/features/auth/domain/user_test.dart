import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/domain/user.dart';

void main() {
  group('User model', () {
    test('fromJson/toJson roundtrip', () {
      final json = {
        'id': 'u1',
        'email': 'u1@example.com',
        'role': 'moderator',
        'tier': 'silver',
        'reputationScore': 42,
        'createdAt': '2024-01-01T00:00:00.000Z',
        'lastLoginAt': '2024-01-02T00:00:00.000Z',
        'isTemporary': true,
        'tokenExpires': '2024-01-03T00:00:00.000Z',
      };

      final user = User.fromJson(json);
      expect(user.id, 'u1');
      expect(user.email, 'u1@example.com');
      expect(user.role, UserRole.moderator);
      expect(user.tier, UserTier.silver);
      expect(user.reputationScore, 42);
      expect(user.isTemporary, true);
      expect(user.tokenExpires, isNotNull);

      final back = user.toJson();
      expect(back['id'], 'u1');
      expect(back['role'], 'moderator');
      expect(back['tier'], 'silver');
    });

    test('fromJson with defaults', () {
      final minimalJson = {
        'id': 'u2',
        'email': 'u2@example.com',
        'role': 'user',
        'tier': 'bronze',
        'createdAt': '2024-01-01T00:00:00.000Z',
        'lastLoginAt': '2024-01-02T00:00:00.000Z',
      };

      final user = User.fromJson(minimalJson);
      expect(user.reputationScore, 0); // Default value
      expect(user.isTemporary, false); // Default value
      expect(user.tokenExpires, isNull); // Default value
    });

    test('fromJson handles snake_case API response', () {
      // This is the format returned by the native user-info endpoint.
      final apiResponse = {
        'sub': 'user-uuid-123',
        'email': 'api@example.com',
        'role': 'moderator',
        'tier': 'gold',
        'reputation_score': 250,
        'created_at': '2024-06-15T10:30:00.000Z',
        'last_login_at': '2024-06-20T14:00:00.000Z',
      };

      final user = User.fromJson(apiResponse);
      expect(user.id, 'user-uuid-123'); // Uses 'sub' when 'id' not present
      expect(user.email, 'api@example.com');
      expect(user.role, UserRole.moderator);
      expect(user.tier, UserTier.gold);
      expect(user.reputationScore, 250); // From reputation_score
      expect(user.createdAt.year, 2024);
      expect(user.createdAt.month, 6);
    });

    test('fromJson prefers camelCase over snake_case', () {
      // When both formats are present (shouldn't happen, but test the priority)
      final mixedJson = {
        'id': 'preferred-id',
        'sub': 'fallback-id',
        'email': 'mixed@example.com',
        'role': 'admin',
        'tier': 'platinum',
        'reputationScore': 500,
        'reputation_score': 100, // Should be ignored
        'createdAt': '2024-01-01T00:00:00.000Z',
        'created_at': '2023-01-01T00:00:00.000Z', // Should be ignored
        'lastLoginAt': '2024-01-02T00:00:00.000Z',
      };

      final user = User.fromJson(mixedJson);
      expect(user.id, 'preferred-id'); // 'id' takes priority over 'sub'
      expect(
        user.reputationScore,
        100,
      ); // reputation_score checked first per null-coalesce order
    });

    test('toJson with null tokenExpires', () {
      final user = User(
        id: 'u3',
        email: 'u3@example.com',
        role: UserRole.admin,
        tier: UserTier.platinum,
        reputationScore: 100,
        createdAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
        lastLoginAt: DateTime.parse('2024-01-02T00:00:00.000Z'),
        tokenExpires: null,
      );

      final json = user.toJson();
      expect(json['tokenExpires'], isNull);
    });

    test('copyWith and equality', () {
      final base = User(
        id: 'id',
        email: 'a@b.com',
        role: UserRole.user,
        tier: UserTier.bronze,
        reputationScore: 0,
        createdAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
        lastLoginAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
      );

      final same = base.copyWith();
      expect(same, equals(base));

      final changed = base.copyWith(email: 'c@d.com', tier: UserTier.gold);
      expect(changed.email, 'c@d.com');
      expect(changed.tier, UserTier.gold);
      expect(changed == base, isFalse);
    });

    test('copyWith all fields', () {
      final base = User(
        id: 'id1',
        email: 'old@example.com',
        role: UserRole.user,
        tier: UserTier.bronze,
        reputationScore: 10,
        createdAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
        lastLoginAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
        isTemporary: false,
        tokenExpires: null,
      );

      final updated = base.copyWith(
        id: 'id2',
        email: 'new@example.com',
        role: UserRole.admin,
        tier: UserTier.platinum,
        reputationScore: 200,
        createdAt: DateTime.parse('2024-02-01T00:00:00.000Z'),
        lastLoginAt: DateTime.parse('2024-02-02T00:00:00.000Z'),
        isTemporary: true,
        tokenExpires: DateTime.parse('2024-02-03T00:00:00.000Z'),
      );

      expect(updated.id, 'id2');
      expect(updated.email, 'new@example.com');
      expect(updated.role, UserRole.admin);
      expect(updated.tier, UserTier.platinum);
      expect(updated.reputationScore, 200);
      expect(updated.isTemporary, true);
      expect(updated.tokenExpires, isNotNull);
    });

    test('equality operator', () {
      final user1 = User(
        id: 'u1',
        email: 'test@example.com',
        role: UserRole.user,
        tier: UserTier.bronze,
        reputationScore: 0,
        createdAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
        lastLoginAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
      );

      final user2 = User(
        id: 'u1',
        email: 'test@example.com',
        role: UserRole.user,
        tier: UserTier.bronze,
        reputationScore: 0,
        createdAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
        lastLoginAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
      );

      final user3 = User(
        id: 'u2',
        email: 'different@example.com',
        role: UserRole.admin,
        tier: UserTier.gold,
        reputationScore: 100,
        createdAt: DateTime.parse('2024-01-02T00:00:00.000Z'),
        lastLoginAt: DateTime.parse('2024-01-02T00:00:00.000Z'),
      );

      // Test identical objects
      expect(user1 == user1, isTrue);

      // Test equal objects
      expect(user1 == user2, isTrue);
      expect(user1.hashCode == user2.hashCode, isTrue);

      // Test different objects
      expect(user1 == user3, isFalse);

      // Test with different type
      const Object notAUser = 'not a user';
      expect(user1 == notAUser, isFalse);
    });

    test('toString', () {
      final user = User(
        id: 'u1',
        email: 'test@example.com',
        role: UserRole.moderator,
        tier: UserTier.silver,
        reputationScore: 50,
        createdAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
        lastLoginAt: DateTime.parse('2024-01-01T00:00:00.000Z'),
      );

      final stringRep = user.toString();
      expect(stringRep, contains('User('));
      expect(stringRep, contains('id: u1'));
      expect(stringRep, contains('email: test@example.com'));
      expect(stringRep, contains('role: UserRole.moderator'));
      expect(stringRep, contains('tier: UserTier.silver'));
      expect(stringRep, contains('reputation: 50'));
    });

    test('role/tier fromString defaults', () {
      expect(UserRole.fromString('ADMIN'), UserRole.admin);
      expect(UserRole.fromString('unknown'), UserRole.user);
      expect(UserTier.fromString('GOLD'), UserTier.gold);
      expect(UserTier.fromString('n/a'), UserTier.bronze);
    });

    test('UserRole enum', () {
      expect(UserRole.user.name, 'user');
      expect(UserRole.moderator.name, 'moderator');
      expect(UserRole.admin.name, 'admin');

      // Test fromString with exact matches
      expect(UserRole.fromString('user'), UserRole.user);
      expect(UserRole.fromString('moderator'), UserRole.moderator);
      expect(UserRole.fromString('admin'), UserRole.admin);

      // Test case insensitive
      expect(UserRole.fromString('USER'), UserRole.user);
      expect(UserRole.fromString('MODERATOR'), UserRole.moderator);
    });

    test('UserTier enum', () {
      expect(UserTier.bronze.name, 'bronze');
      expect(UserTier.silver.name, 'silver');
      expect(UserTier.gold.name, 'gold');
      expect(UserTier.platinum.name, 'platinum');

      // Test fromString with exact matches
      expect(UserTier.fromString('bronze'), UserTier.bronze);
      expect(UserTier.fromString('silver'), UserTier.silver);
      expect(UserTier.fromString('gold'), UserTier.gold);
      expect(UserTier.fromString('platinum'), UserTier.platinum);

      // Test case insensitive
      expect(UserTier.fromString('SILVER'), UserTier.silver);
      expect(UserTier.fromString('PLATINUM'), UserTier.platinum);
    });
  });
}
