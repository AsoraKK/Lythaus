import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/analytics/analytics_consent.dart';

void main() {
  group('AnalyticsConsent', () {
    group('Serialization', () {
      test('fromJson creates consent from valid JSON', () {
        final json = {
          'enabled': true,
          'updatedAt': '2024-01-15T10:30:00.000Z',
          'source': 'onboarding',
          'policyVersion': 2,
        };

        final consent = AnalyticsConsent.fromJson(json);

        expect(consent.enabled, isTrue);
        expect(consent.updatedAt, DateTime.parse('2024-01-15T10:30:00.000Z'));
        expect(consent.source, ConsentSource.onboarding);
        expect(consent.policyVersion, 2);
      });

      test('toJson serializes consent correctly', () {
        final consent = AnalyticsConsent(
          enabled: true,
          updatedAt: DateTime.parse('2024-01-15T10:30:00.000Z'),
          source: ConsentSource.privacySettings,
          policyVersion: 3,
        );

        final json = consent.toJson();

        expect(json['enabled'], isTrue);
        expect(json['updatedAt'], isA<String>());
        expect(json['source'], 'privacySettings');
        expect(json['policyVersion'], 3);
      });

      test('round-trip serialization preserves data', () {
        final original = AnalyticsConsent(
          enabled: true,
          updatedAt: DateTime.parse('2024-01-15T10:30:00.000Z'),
          source: ConsentSource.migration,
          policyVersion: 5,
        );

        final json = original.toJson();
        final restored = AnalyticsConsent.fromJson(json);

        expect(restored.enabled, original.enabled);
        expect(restored.source, original.source);
        expect(restored.policyVersion, original.policyVersion);
      });
    });

    group('Factory constructors', () {
      test('defaultConsent returns disabled consent', () {
        final consent = AnalyticsConsent.defaultConsent();

        expect(consent.enabled, isFalse);
        expect(consent.source, ConsentSource.unknown);
        expect(consent.policyVersion, 1);
      });
    });

    group('copyWith', () {
      test('copyWith creates modified copy', () {
        final original = AnalyticsConsent(
          enabled: false,
          updatedAt: DateTime.parse('2024-01-15T10:30:00.000Z'),
          source: ConsentSource.unknown,
        );

        final modified = original.copyWith(
          enabled: true,
          source: ConsentSource.onboarding,
          policyVersion: 2,
        );

        expect(modified.enabled, isTrue);
        expect(modified.source, ConsentSource.onboarding);
        expect(modified.policyVersion, 2);
        expect(original.enabled, isFalse); // Original unchanged
      });

      test('copyWith preserves unmodified fields', () {
        final now = DateTime.now();
        final original = AnalyticsConsent(
          enabled: true,
          updatedAt: now,
          source: ConsentSource.onboarding,
          policyVersion: 2,
        );

        final modified = original.copyWith(enabled: false);

        expect(modified.enabled, isFalse);
        expect(modified.updatedAt, now);
        expect(modified.source, ConsentSource.onboarding);
        expect(modified.policyVersion, 2);
      });
    });

    group('ConsentSource enum', () {
      test('enum values serialize correctly', () {
        expect(ConsentSource.unknown.toString(), 'ConsentSource.unknown');
        expect(ConsentSource.onboarding.toString(), 'ConsentSource.onboarding');
        expect(
          ConsentSource.privacySettings.toString(),
          'ConsentSource.privacySettings',
        );
        expect(ConsentSource.migration.toString(), 'ConsentSource.migration');
      });

      test('fromJson handles all enum values', () {
        expect(
          AnalyticsConsent.fromJson(const {
            'enabled': false,
            'updatedAt': '2024-01-01T00:00:00.000Z',
            'source': 'unknown',
            'policyVersion': 1,
          }).source,
          ConsentSource.unknown,
        );
        expect(
          AnalyticsConsent.fromJson(const {
            'enabled': true,
            'updatedAt': '2024-01-01T00:00:00.000Z',
            'source': 'onboarding',
            'policyVersion': 1,
          }).source,
          ConsentSource.onboarding,
        );
        expect(
          AnalyticsConsent.fromJson(const {
            'enabled': true,
            'updatedAt': '2024-01-01T00:00:00.000Z',
            'source': 'privacySettings',
            'policyVersion': 1,
          }).source,
          ConsentSource.privacySettings,
        );
        expect(
          AnalyticsConsent.fromJson(const {
            'enabled': true,
            'updatedAt': '2024-01-01T00:00:00.000Z',
            'source': 'migration',
            'policyVersion': 1,
          }).source,
          ConsentSource.migration,
        );
      });
    });

    group('Equality', () {
      test('equal consents are equal', () {
        final now = DateTime.parse('2024-01-15T10:30:00.000Z');
        final consent1 = AnalyticsConsent(
          enabled: true,
          updatedAt: now,
          source: ConsentSource.onboarding,
          policyVersion: 2,
        );
        final consent2 = AnalyticsConsent(
          enabled: true,
          updatedAt: now,
          source: ConsentSource.onboarding,
          policyVersion: 2,
        );

        expect(consent1 == consent2, isTrue);
        expect(consent1.hashCode == consent2.hashCode, isTrue);
      });

      test('different consents are not equal', () {
        final now = DateTime.now();
        final consent1 = AnalyticsConsent(
          enabled: true,
          updatedAt: now,
          source: ConsentSource.onboarding,
        );
        final consent2 = AnalyticsConsent(
          enabled: false,
          updatedAt: now,
          source: ConsentSource.onboarding,
        );

        expect(consent1 == consent2, isFalse);
      });
    });
  });
}
