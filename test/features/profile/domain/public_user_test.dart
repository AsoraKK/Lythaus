import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('handleLabel returns handle when present', () {
    const user = PublicUser(
      id: 'user-123456',
      displayName: 'Lythaus User',
      handle: '@lythaus',
      tier: 'gold',
    );

    expect(user.handleLabel, '@lythaus');
  });

  test('handleLabel is absent until the account has a real handle', () {
    const user = PublicUser(
      id: 'abc12345',
      displayName: 'Fallback User',
      tier: 'free',
    );

    expect(user.handleLabel, isNull);
  });

  test('handleLabel adds a display prefix to a real handle', () {
    const user = PublicUser(
      id: 'user-123456',
      displayName: 'Lythaus User',
      handle: 'lythaus',
      tier: 'free',
    );

    expect(user.handleLabel, '@lythaus');
  });

  test('fromJson applies defaults for optional fields', () {
    final user = PublicUser.fromJson(const {'id': 'u1', 'displayName': 'Test'});

    expect(user.tier, 'free');
    expect(user.trustPassportVisibility, 'public_minimal');
    expect(user.reputationScore, 0);
    expect(user.journalistVerified, isFalse);
    expect(user.badges, isEmpty);
  });

  test('fromJson accepts the canonical structured reputation response', () {
    final user = PublicUser.fromJson(const {
      'id': 'u1',
      'displayName': 'Test',
      'reputationLevel': 2,
      'reputation': {
        'level': 2,
        'label': 'Contributor',
        'status': 'active',
        'policyVersion': 'synthetic',
      },
    });

    expect(user.displayName, 'Test');
    expect(user.reputationScore, 0);
  });

  test('fromJson preserves legacy numeric reputation responses', () {
    for (final key in ['reputationScore', 'reputation']) {
      final user = PublicUser.fromJson({
        'id': 'u1',
        'displayName': 'Test',
        key: 42,
      });
      expect(user.reputationScore, 42);
    }
  });

  test('fromJson uses username fallback for handle', () {
    final user = PublicUser.fromJson(const {
      'id': 'u2',
      'displayName': 'Test',
      'username': '@u2',
    });

    expect(user.handleLabel, '@u2');
  });

  test('fromJson falls back to public_minimal for unknown visibility', () {
    final user = PublicUser.fromJson(const {
      'id': 'u3',
      'displayName': 'Visibility User',
      'trustPassportVisibility': 'friends_only',
    });

    expect(user.trustPassportVisibility, 'public_minimal');
  });
}
