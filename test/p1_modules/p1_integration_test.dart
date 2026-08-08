// P1 MODULES INTEGRATION TEST
//
// 🎯 Purpose: Ensure P1 modules are included in coverage reports
// 📊 Coverage: Forces inclusion of critical modules in CI/CD pipeline
// ✅ Integration: Tests P1 modules work together correctly

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/p1_modules/critical_auth_validator.dart';
import 'package:lythaus/p1_modules/critical_security_ops.dart';

void main() {
  group('P1 Modules Integration', () {
    test('should validate user input through security pipeline', () {
      const userEmail = 'test@example.com';
      const userPassword = 'SecurePass123!';
      const userContent = 'This is a safe post about my day.';

      // Authentication validation
      expect(CriticalAuthValidator.validateEmailFormat(userEmail), true);

      final passwordResult = CriticalAuthValidator.validatePasswordStrength(
        userPassword,
      );
      expect(passwordResult.isValid, true);

      // Content security validation
      final contentResult = CriticalSecurityOps.validateContent(userContent);
      expect(contentResult.isSafe, true);

      // Input sanitization
      final sanitized = CriticalSecurityOps.sanitizeUserInput(userContent);
      expect(sanitized, equals(userContent));
    });

    test('should block malicious attempts through security pipeline', () {
      const maliciousEmail = 'bad..email@';
      const weakPassword = '123';
      const maliciousContent = '<script>alert("xss")</script>';

      // Should reject bad inputs
      expect(CriticalAuthValidator.validateEmailFormat(maliciousEmail), false);

      final passwordResult = CriticalAuthValidator.validatePasswordStrength(
        weakPassword,
      );
      expect(passwordResult.isValid, false);

      final contentResult = CriticalSecurityOps.validateContent(
        maliciousContent,
      );
      expect(contentResult.isSafe, false);
      expect(contentResult.threatLevel, equals(ThreatLevel.high));

      // Should sanitize dangerous content
      final sanitized = CriticalSecurityOps.sanitizeUserInput(maliciousContent);
      expect(sanitized, isNot(contains('<script')));
    });

    test('should generate secure tokens for session management', () {
      final token1 = CriticalSecurityOps.generateSecureToken(32);
      final token2 = CriticalSecurityOps.generateSecureToken(32);

      expect(token1.length, equals(32));
      expect(token2.length, equals(32));
      expect(token1, isNot(equals(token2))); // Should be different

      // Create JWT-like tokens for session validation
      final jwtToken =
          'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.${CriticalSecurityOps.generateSecureToken(20)}.${CriticalSecurityOps.generateSecureToken(20)}';
      expect(CriticalAuthValidator.validateSessionToken(jwtToken), true);
    });

    test('should enforce rate limiting for security', () {
      const clientId = 'client123';

      // Should allow normal usage
      expect(
        CriticalSecurityOps.validateRateLimit(
          clientId,
          30,
          const Duration(minutes: 1),
        ),
        true,
      );
      expect(CriticalAuthValidator.checkRateLimit(clientId, []), true);

      // Should block excessive requests
      expect(
        CriticalSecurityOps.validateRateLimit(
          clientId,
          100,
          const Duration(minutes: 1),
        ),
        false,
      );

      final manyAttempts = List.generate(
        10,
        (i) => DateTime.now().subtract(Duration(seconds: i)),
      );
      expect(
        CriticalAuthValidator.checkRateLimit(clientId, manyAttempts),
        false,
      );
    });

    test('should validate file uploads securely', () {
      // Safe file
      final safeResult = CriticalSecurityOps.validateFileUpload('photo.jpg', [
        1,
        2,
        3,
        4,
      ]);
      expect(safeResult.isValid, true);

      // Dangerous file
      final dangerousResult = CriticalSecurityOps.validateFileUpload(
        'malware.exe',
        [0x4D, 0x5A],
      );
      expect(dangerousResult.isValid, false);
      expect(dangerousResult.errors, contains('Executable file detected'));
    });
  });
}
