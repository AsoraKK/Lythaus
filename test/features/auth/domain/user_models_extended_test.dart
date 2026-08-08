// ignore_for_file: public_member_api_docs
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/auth/domain/user_models.dart';

void main() {
  group('UserAuthData.toJson', () {
    test('serialises all fields correctly', () {
      const authData = UserAuthData(
        userId: 'u-123',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'moderator',
        tier: 'premium',
      );

      final json = authData.toJson();

      expect(json['userId'], 'u-123');
      expect(json['email'], 'test@example.com');
      expect(json['displayName'], 'Test User');
      expect(json['role'], 'moderator');
      expect(json['tier'], 'premium');
    });

    test('roundtrips through fromJson', () {
      const authData = UserAuthData(
        userId: 'u-456',
        email: 'round@trip.com',
        displayName: 'Round Trip',
        role: 'admin',
        tier: 'black',
      );

      final json = authData.toJson();
      final restored = UserAuthData.fromJson(json);

      expect(restored.userId, authData.userId);
      expect(restored.email, authData.email);
      expect(restored.displayName, authData.displayName);
      expect(restored.role, authData.role);
      expect(restored.tier, authData.tier);
    });
  });

  group('UserInfo.fromJson', () {
    test('parses all fields from JSON', () {
      final json = {
        'id': 'info-1',
        'displayName': 'From JSON',
        'role': 'user',
        'tier': 'free',
      };
      final info = UserInfo.fromJson(json);

      expect(info.id, 'info-1');
      expect(info.displayName, 'From JSON');
      expect(info.role, 'user');
      expect(info.tier, 'free');
    });

    test('role helpers return correct values for regular user', () {
      final info = UserInfo.fromJson({
        'id': 'u1',
        'displayName': 'User',
        'role': 'user',
        'tier': 'free',
      });
      expect(info.isAdmin, isFalse);
      expect(info.isModerator, isFalse);
      expect(info.isPremium, isFalse);
    });

    test('role helpers for moderator', () {
      final info = UserInfo.fromJson({
        'id': 'u2',
        'displayName': 'Mod',
        'role': 'moderator',
        'tier': 'premium',
      });
      expect(info.isAdmin, isFalse);
      expect(info.isModerator, isTrue);
      expect(info.isPremium, isTrue);
    });

    test('toJson round-trips', () {
      final original = UserInfo.fromJson({
        'id': 'u3',
        'displayName': 'Roundtrip',
        'role': 'admin',
        'tier': 'black',
      });
      final json = original.toJson();
      final restored = UserInfo.fromJson(json);
      expect(restored.id, original.id);
      expect(restored.displayName, original.displayName);
      expect(restored.role, original.role);
      expect(restored.tier, original.tier);
    });
  });

  group('UserInfo.fromAuthData', () {
    test('maps all fields from UserAuthData', () {
      const authData = UserAuthData(
        userId: 'auth-1',
        email: 'bridge@test.com',
        displayName: 'Bridge',
        role: 'admin',
        tier: 'premium',
      );
      final info = UserInfo.fromAuthData(authData);

      expect(info.id, 'auth-1');
      expect(info.displayName, 'Bridge');
      expect(info.role, 'admin');
      expect(info.tier, 'premium');
      expect(info.isAdmin, isTrue);
      expect(info.isModerator, isTrue);
      expect(info.isPremium, isTrue);
    });
  });
}
