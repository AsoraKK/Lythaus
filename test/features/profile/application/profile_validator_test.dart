// ignore_for_file: public_member_api_docs
import 'package:flutter_test/flutter_test.dart';
import 'dart:convert';
import 'dart:io';

import 'package:lythaus/features/profile/application/profile_validator.dart';

void main() {
  final fixtures =
      jsonDecode(
            File(
              'packages/contracts/fixtures/profile-name-policy.json',
            ).readAsStringSync(),
          )
          as List;
  for (final fixture in fixtures.cast<Map<String, dynamic>>()) {
    test('shared profile-name policy: ${fixture['value']}', () {
      expect(
        ProfileValidator.validateDisplayName(fixture['value'] as String) ==
            null,
        fixture['valid'],
      );
    });
  }
  test('profile text limits match the API', () {
    expect(ProfileValidator.validateDisplayName('a' * 160), isNull);
    expect(ProfileValidator.validateDisplayName('a' * 161), isNotNull);
    expect(ProfileValidator.validateBio('a' * 2000), isNull);
    expect(ProfileValidator.validateBio('a' * 2001), isNotNull);
  });
  group('ProfileValidator.validateDisplayName', () {
    test('returns error for null input', () {
      expect(
        ProfileValidator.validateDisplayName(null),
        'Display name is required',
      );
    });

    test('returns error for empty string', () {
      expect(
        ProfileValidator.validateDisplayName(''),
        'Display name is required',
      );
    });

    test('returns error for whitespace-only string', () {
      expect(
        ProfileValidator.validateDisplayName('   '),
        'Display name is required',
      );
    });

    test('returns null for valid name', () {
      expect(ProfileValidator.validateDisplayName('Ada Lovelace'), isNull);
    });

    test('returns error for name with profanity', () {
      expect(
        ProfileValidator.validateDisplayName('some fuck word'),
        'Please choose a different display name',
      );
    });

    test('profanity check is case insensitive', () {
      expect(
        ProfileValidator.validateDisplayName('SHIT happens'),
        'Please choose a different display name',
      );
    });

    test('allows names without profanity', () {
      expect(ProfileValidator.validateDisplayName('Good User'), isNull);
    });
  });

  group('ProfileValidator.validateBio', () {
    test('returns null for null input', () {
      expect(ProfileValidator.validateBio(null), isNull);
    });

    test('returns null for empty string', () {
      expect(ProfileValidator.validateBio(''), isNull);
    });

    test('returns null for valid bio', () {
      expect(ProfileValidator.validateBio('Software engineer by day'), isNull);
    });

    test('returns error for bio with profanity', () {
      expect(
        ProfileValidator.validateBio('what the fuck'),
        'Please remove profane language',
      );
    });

    test('profanity check is case insensitive', () {
      expect(
        ProfileValidator.validateBio('Total BITCH move'),
        'Please remove profane language',
      );
    });
  });
}
