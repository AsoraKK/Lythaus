// ignore_for_file: public_member_api_docs
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/security/tier_limits.dart';

void main() {
  group('TierLimits constructor', () {
    test('stores maxChars, maxMedia, postsPerHour', () {
      const limits = TierLimits(100, 2, 10);
      expect(limits.maxChars, 100);
      expect(limits.maxMedia, 2);
      expect(limits.postsPerHour, 10);
    });
  });

  group('kTierLimits map', () {
    test('contains all expected tiers', () {
      expect(kTierLimits, contains('free'));
      expect(kTierLimits, contains('premium'));
      expect(kTierLimits, contains('black'));
      expect(kTierLimits, contains('pro'));
      expect(kTierLimits, contains('admin'));
      expect(kTierLimits, contains('dev'));
    });

    test('free tier has expected limits', () {
      final free = kTierLimits['free']!;
      expect(free.maxChars, 500);
      expect(free.maxMedia, 1);
      expect(free.postsPerHour, 5);
    });

    test('premium tier has expected limits', () {
      final premium = kTierLimits['premium']!;
      expect(premium.maxChars, 2000);
      expect(premium.maxMedia, 2);
      expect(premium.postsPerHour, 20);
    });

    test('black tier has expected limits', () {
      final black = kTierLimits['black']!;
      expect(black.maxChars, 5000);
      expect(black.maxMedia, 5);
      expect(black.postsPerHour, 50);
    });

    test('admin tier has expected limits', () {
      final admin = kTierLimits['admin']!;
      expect(admin.maxChars, 5000);
      expect(admin.maxMedia, 10);
      expect(admin.postsPerHour, 100);
    });

    test('pro is a legacy alias for premium', () {
      final pro = kTierLimits['pro']!;
      final premium = kTierLimits['premium']!;
      expect(pro.maxChars, premium.maxChars);
      expect(pro.maxMedia, premium.maxMedia);
      expect(pro.postsPerHour, premium.postsPerHour);
    });
  });

  group('tierLimits()', () {
    test('returns correct limits for known tier', () {
      final limits = tierLimits('premium');
      expect(limits.maxChars, 2000);
    });

    test('returns free limits for unknown tier', () {
      final limits = tierLimits('unknown_tier');
      expect(limits.maxChars, 500);
      expect(limits.maxMedia, 1);
      expect(limits.postsPerHour, 5);
    });
  });

  group('canPostContent()', () {
    test('returns true when within limits', () {
      expect(canPostContent('free', 400, 1), isTrue);
    });

    test('returns false when content exceeds maxChars', () {
      expect(canPostContent('free', 501, 0), isFalse);
    });

    test('returns false when media exceeds maxMedia', () {
      expect(canPostContent('free', 100, 2), isFalse);
    });

    test('returns true at exact limits', () {
      expect(canPostContent('free', 500, 1), isTrue);
    });

    test('returns false when both exceed', () {
      expect(canPostContent('free', 600, 5), isFalse);
    });

    test('premium tier allows more', () {
      expect(canPostContent('premium', 1500, 2), isTrue);
    });

    test('unknown tier falls back to free limits', () {
      expect(canPostContent('unknown', 501, 0), isFalse);
      expect(canPostContent('unknown', 500, 1), isTrue);
    });
  });
}
