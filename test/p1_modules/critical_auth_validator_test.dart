// TESTS FOR CRITICAL AUTH VALIDATOR (P1 MODULE)
//
// 🧪 Purpose: Comprehensive test coverage for critical authentication logic
// 📊 Coverage: Must achieve 80%+ coverage for deployment gate
// ✅ Testing: All critical security validation functions

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/p1_modules/critical_auth_validator.dart';
import 'package:lythaus/features/auth/application/auth_state.dart';

void main() {
  group('CriticalAuthValidator', () {
    group('validateSessionToken', () {
      test('should return false for null token', () {
        expect(CriticalAuthValidator.validateSessionToken(null), false);
      });

      test('should return false for empty token', () {
        expect(CriticalAuthValidator.validateSessionToken(''), false);
      });

      test('should return false for malformed token', () {
        expect(CriticalAuthValidator.validateSessionToken('invalid'), false);
        expect(CriticalAuthValidator.validateSessionToken('one.two'), false);
        expect(
          CriticalAuthValidator.validateSessionToken('one.two.three.four'),
          false,
        );
      });

      test('should return false for short token', () {
        expect(CriticalAuthValidator.validateSessionToken('a.b.c'), false);
      });

      test('should return true for valid token format', () {
        const validToken =
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
        expect(CriticalAuthValidator.validateSessionToken(validToken), true);
      });

      test('should handle edge cases', () {
        // Very long valid token
        final longToken = 'very.long.token${'x' * 100}';
        expect(CriticalAuthValidator.validateSessionToken(longToken), true);
      });
    });

    group('validateUserPermission', () {
      test('should return false for guest user', () {
        const authState = AuthState.guest();
        expect(
          CriticalAuthValidator.validateUserPermission(
            authState,
            'delete_account',
          ),
          false,
        );
      });

      test('should return false for loading state', () {
        const authState = AuthState.loading();
        expect(
          CriticalAuthValidator.validateUserPermission(
            authState,
            'delete_account',
          ),
          false,
        );
      });

      test('should return false for authenticated user without userId', () {
        // Create an authenticated state but manually set userId to null (edge case)
        const authState = AuthState(AuthStatus.authed, userId: null);
        expect(
          CriticalAuthValidator.validateUserPermission(
            authState,
            'delete_account',
          ),
          false,
        );
      });

      test('should return false for authenticated user with empty userId', () {
        const authState = AuthState.authed('');
        expect(
          CriticalAuthValidator.validateUserPermission(
            authState,
            'delete_account',
          ),
          false,
        );
      });

      test('should return true for authenticated user with valid userId', () {
        const authState = AuthState.authed('user123');
        expect(
          CriticalAuthValidator.validateUserPermission(
            authState,
            'delete_account',
          ),
          true,
        );
      });

      test('should validate all critical actions', () {
        const authState = AuthState.authed('user123');
        const criticalActions = [
          'delete_account',
          'export_data',
          'modify_privacy',
          'admin_action',
        ];

        for (final action in criticalActions) {
          expect(
            CriticalAuthValidator.validateUserPermission(authState, action),
            true,
          );
        }
      });

      test(
        'should return true for non-critical actions with any auth state',
        () {
          const authState = AuthState.authed('user123');
          expect(
            CriticalAuthValidator.validateUserPermission(
              authState,
              'read_posts',
            ),
            true,
          );
        },
      );
    });

    group('validatePasswordStrength', () {
      test('should reject passwords that are too short', () {
        final result = CriticalAuthValidator.validatePasswordStrength('123');
        expect(result.isValid, false);
        expect(
          result.errors,
          contains('Password must be at least 8 characters long'),
        );
      });

      test('should reject passwords without uppercase letters', () {
        final result = CriticalAuthValidator.validatePasswordStrength(
          'password123!',
        );
        expect(result.isValid, false);
        expect(
          result.errors,
          contains('Password must contain at least one uppercase letter'),
        );
      });

      test('should reject passwords without lowercase letters', () {
        final result = CriticalAuthValidator.validatePasswordStrength(
          'PASSWORD123!',
        );
        expect(result.isValid, false);
        expect(
          result.errors,
          contains('Password must contain at least one lowercase letter'),
        );
      });

      test('should reject passwords without numbers', () {
        final result = CriticalAuthValidator.validatePasswordStrength(
          'Password!',
        );
        expect(result.isValid, false);
        expect(
          result.errors,
          contains('Password must contain at least one number'),
        );
      });

      test('should reject passwords without special characters', () {
        final result = CriticalAuthValidator.validatePasswordStrength(
          'Password123',
        );
        expect(result.isValid, false);
        expect(
          result.errors,
          contains('Password must contain at least one special character'),
        );
      });

      test('should reject common weak passwords', () {
        const weakPasswords = [
          'password',
          '123456',
          'password123',
          'admin',
          'qwerty',
        ];

        for (final weakPassword in weakPasswords) {
          final result = CriticalAuthValidator.validatePasswordStrength(
            weakPassword,
          );
          expect(result.isValid, false);
          expect(
            result.errors,
            contains('Password is too common and insecure'),
          );
        }
      });

      test('should accept strong passwords', () {
        final result = CriticalAuthValidator.validatePasswordStrength(
          'MySecure123!',
        );
        expect(result.isValid, true);
        expect(result.errors, isEmpty);
        expect(
          result.summary,
          equals('Password meets all security requirements'),
        );
      });

      test('should provide comprehensive error messages', () {
        final result = CriticalAuthValidator.validatePasswordStrength('weak');
        expect(result.isValid, false);
        expect(result.errors.length, greaterThan(1));
        expect(result.summary, startsWith('Password validation failed:'));
      });
    });

    group('validateEmailFormat', () {
      test('should return false for empty email', () {
        expect(CriticalAuthValidator.validateEmailFormat(''), false);
      });

      test('should return false for invalid email formats', () {
        const invalidEmails = [
          'plainaddress',
          '@missingdomain.com',
          'missing@.com',
          'missing@domain',
          'spaces @domain.com',
          'invalid..email@domain.com',
        ];

        for (final email in invalidEmails) {
          expect(CriticalAuthValidator.validateEmailFormat(email), false);
        }
      });

      test('should return true for valid email formats', () {
        const validEmails = [
          'user@domain.com',
          'user.name@domain.com',
          'user+tag@domain.co.uk',
          'test123@example.org',
          'a@b.co',
        ];

        for (final email in validEmails) {
          expect(CriticalAuthValidator.validateEmailFormat(email), true);
        }
      });
    });

    group('checkRateLimit', () {
      test('should allow requests when under limit', () {
        final attempts = <DateTime>[];
        expect(CriticalAuthValidator.checkRateLimit('user123', attempts), true);
      });

      test('should allow requests with old attempts', () {
        final attempts = [
          DateTime.now().subtract(const Duration(hours: 2)),
          DateTime.now().subtract(const Duration(hours: 3)),
        ];
        expect(CriticalAuthValidator.checkRateLimit('user123', attempts), true);
      });

      test('should block requests when over limit', () {
        final attempts = List.generate(5, (index) => DateTime.now());
        expect(
          CriticalAuthValidator.checkRateLimit('user123', attempts),
          false,
        );
      });

      test('should clean up old attempts', () {
        final attempts = [
          DateTime.now().subtract(
            const Duration(hours: 2),
          ), // Should be removed
          DateTime.now(),
          DateTime.now(),
        ];

        CriticalAuthValidator.checkRateLimit('user123', attempts);
        expect(attempts.length, 2); // Old attempt removed
      });

      test('should handle edge case at limit boundary', () {
        final attempts = List.generate(4, (index) => DateTime.now());
        expect(CriticalAuthValidator.checkRateLimit('user123', attempts), true);

        attempts.add(DateTime.now());
        expect(
          CriticalAuthValidator.checkRateLimit('user123', attempts),
          false,
        );
      });
    });
  });

  group('generateUntestedSecurityHash', () {
    test('should generate hash for valid input', () {
      // Arrange
      const input = 'test_input';

      // Act
      final hash = PasswordValidationResult.generateUntestedSecurityHash(input);

      // Assert
      expect(hash, isNotEmpty);
      expect(hash, contains('-'));
      expect(hash, endsWith('-untested'));

      // Should contain input hashcode and timestamp
      final parts = hash.split('-');
      expect(parts, hasLength(3));
      expect(parts[2], equals('untested'));
    });

    test('should throw ArgumentError for empty input', () {
      // Act & Assert
      expect(
        () => PasswordValidationResult.generateUntestedSecurityHash(''),
        throwsA(isA<ArgumentError>()),
      );
    });

    test('should generate different hashes for different inputs', () {
      // Arrange
      const input1 = 'test_input_1';
      const input2 = 'test_input_2';

      // Act
      final hash1 = PasswordValidationResult.generateUntestedSecurityHash(
        input1,
      );
      final hash2 = PasswordValidationResult.generateUntestedSecurityHash(
        input2,
      );

      // Assert
      expect(hash1, isNot(equals(hash2)));
      expect(hash1, endsWith('-untested'));
      expect(hash2, endsWith('-untested'));
    });

    test('should generate unique hashes with timestamp', () async {
      // Arrange
      const input = 'same_input';

      // Act - Generate hashes with small delay to ensure different timestamps
      final hash1 = PasswordValidationResult.generateUntestedSecurityHash(
        input,
      );
      // Small delay to ensure different timestamps
      await Future<void>.delayed(const Duration(milliseconds: 1));
      final hash2 = PasswordValidationResult.generateUntestedSecurityHash(
        input,
      );

      // Assert
      expect(hash1, isNot(equals(hash2))); // Different due to timestamp

      // Both should have the same base format
      final parts1 = hash1.split('-');
      final parts2 = hash2.split('-');
      expect(parts1[0], equals(parts2[0])); // Same input hashcode
      expect(parts1[2], equals(parts2[2])); // Same suffix
    });

    test('should handle special characters in input', () {
      // Arrange
      const specialInput = 'test@#\$%^&*()input';

      // Act
      final hash = PasswordValidationResult.generateUntestedSecurityHash(
        specialInput,
      );

      // Assert
      expect(hash, isNotEmpty);
      expect(hash, endsWith('-untested'));
    });

    test('should handle very long input', () {
      // Arrange
      final longInput = 'a' * 1000;

      // Act
      final hash = PasswordValidationResult.generateUntestedSecurityHash(
        longInput,
      );

      // Assert
      expect(hash, isNotEmpty);
      expect(hash, endsWith('-untested'));
    });
  });

  group('PasswordValidationResult', () {
    test('should provide correct summary for valid password', () {
      final result = PasswordValidationResult()..isValid = true;
      expect(
        result.summary,
        equals('Password meets all security requirements'),
      );
    });

    test('should provide detailed summary for invalid password', () {
      final result = PasswordValidationResult()
        ..isValid = false
        ..errors.addAll(['Error 1', 'Error 2']);
      expect(
        result.summary,
        equals('Password validation failed: Error 1, Error 2'),
      );
    });
  });
}
