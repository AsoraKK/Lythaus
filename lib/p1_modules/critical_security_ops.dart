// ignore_for_file: public_member_api_docs

// LYTHAUS P1 CRITICAL SECURITY OPERATIONS
//
// 🛡️ Priority 1 Module: Essential security functions
// ✅ Requires 80% test coverage for deployment
// 🎯 Purpose: Core security operations and validation
//
// This module handles critical security operations including
// data sanitization, XSS prevention, and content validation.

import 'dart:convert';
import 'dart:math';

/// Critical security operations for the Lythaus platform
class CriticalSecurityOps {
  /// Sanitizes user input to prevent XSS attacks
  /// Returns cleaned string safe for display
  static String sanitizeUserInput(String input) {
    if (input.isEmpty) {
      return '';
    }

    String cleaned = input;

    // First remove dangerous protocols
    cleaned = cleaned.replaceAll(
      RegExp(r'javascript:', caseSensitive: false),
      '',
    );
    cleaned = cleaned.replaceAll(RegExp(r'data:', caseSensitive: false), '');
    cleaned = cleaned.replaceAll(
      RegExp(r'vbscript:', caseSensitive: false),
      '',
    );

    // Remove HTML tags but keep the content
    cleaned = cleaned.replaceAll(RegExp(r'<[^>]*>'), '');

    // Escape special characters AFTER removing tags
    cleaned = cleaned
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#x27;')
        .replaceAll('/', '&#x2F;');

    // Remove potentially dangerous protocols
    cleaned = cleaned.replaceAll(
      RegExp(r'javascript:', caseSensitive: false),
      '',
    );
    cleaned = cleaned.replaceAll(RegExp(r'data:', caseSensitive: false), '');
    cleaned = cleaned.replaceAll(
      RegExp(r'vbscript:', caseSensitive: false),
      '',
    );

    return cleaned.trim();
  }

  /// Validates content for malicious patterns
  /// Returns validation result with threat level
  static ContentSecurityResult validateContent(String content) {
    final result = ContentSecurityResult();

    if (content.isEmpty) {
      return result;
    }

    // Check for SQL injection patterns
    const sqlPatterns = [
      r'\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|UNION)\b',
      r"\'.*OR.*\'.*=.*\'", // ' OR '1'='1' and similar patterns
      r'(\d\s*(OR|AND)\s*\d\s*=\s*\d)',
      r"(\'\s*(OR|AND)\s*\d+\s*=\s*\d+)",
      r'(--|\#|/\*)',
      r'(\bTABLE\b|\bUSERS\b|\bPASSWORD\b)',
    ];

    for (final pattern in sqlPatterns) {
      if (RegExp(pattern, caseSensitive: false).hasMatch(content)) {
        result.threatLevel = ThreatLevel.high;
        result.threats.add('Potential SQL injection detected');
        break;
      }
    }

    // Check for XSS patterns
    const xssPatterns = [
      r'<script[^>]*>.*?</script>',
      r'javascript:',
      r'on\w+\s*=',
      r'<iframe[^>]*>',
      r'<object[^>]*>',
      r'<embed[^>]*>',
    ];

    for (final pattern in xssPatterns) {
      if (RegExp(pattern, caseSensitive: false).hasMatch(content)) {
        result.threatLevel = ThreatLevel.high;
        result.threats.add('Potential XSS attack detected');
        break;
      }
    }

    // Check for suspicious URLs
    const suspiciousPatterns = [
      r'bit\.ly',
      r'tinyurl\.com',
      r't\.co',
      r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', // IP addresses
    ];

    for (final pattern in suspiciousPatterns) {
      if (RegExp(pattern, caseSensitive: false).hasMatch(content)) {
        if (result.threatLevel == ThreatLevel.safe) {
          result.threatLevel = ThreatLevel.medium;
        }
        result.threats.add('Suspicious URL detected');
        break;
      }
    }

    return result;
  }

  /// Generates secure random token for authentication
  /// Returns cryptographically secure random string
  static String generateSecureToken(int length) {
    const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    final random = Random.secure();

    return List.generate(
      length,
      (index) => chars[random.nextInt(chars.length)],
    ).join();
  }

  /// Validates file upload security
  /// Returns true if file is safe to upload
  static FileSecurityResult validateFileUpload(
    String fileName,
    List<int> fileBytes,
  ) {
    final result = FileSecurityResult();

    if (fileName.isEmpty || fileBytes.isEmpty) {
      result.isValid = false;
      result.errors.add('Invalid file data');
      return result;
    }

    // Check file extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt'];
    final extension = fileName.toLowerCase().substring(
      fileName.lastIndexOf('.'),
    );

    if (!allowedExtensions.contains(extension)) {
      result.isValid = false;
      result.errors.add('File type not allowed');
    }

    // Check file size (max 10MB)
    if (fileBytes.length > 10 * 1024 * 1024) {
      result.isValid = false;
      result.errors.add('File too large (max 10MB)');
    }

    // Check for executable signatures
    const executableSignatures = [
      [0x4D, 0x5A], // PE/EXE
      [0x7F, 0x45, 0x4C, 0x46], // ELF
      [0xCA, 0xFE, 0xBA, 0xBE], // Mach-O
    ];

    for (final signature in executableSignatures) {
      if (fileBytes.length >= signature.length) {
        bool matches = true;
        for (int i = 0; i < signature.length; i++) {
          if (fileBytes[i] != signature[i]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          result.isValid = false;
          result.errors.add('Executable file detected');
          break;
        }
      }
    }

    return result;
  }

  /// Encodes data for safe JSON transmission
  /// Returns base64 encoded string
  static String encodeForTransmission(Map<String, dynamic> data) {
    try {
      final jsonString = json.encode(data);
      final bytes = utf8.encode(jsonString);
      return base64.encode(bytes);
    } catch (e) {
      return '';
    }
  }

  /// Validates API rate limiting
  /// Returns true if request is within rate limits
  static bool validateRateLimit(
    String clientId,
    int requestCount,
    Duration window,
  ) {
    // Simple rate limiting - in production this would use Redis or database
    const maxRequestsPerMinute = 60;
    const maxRequestsPerHour = 1000;

    if (window.inMinutes <= 1 && requestCount > maxRequestsPerMinute) {
      return false;
    }

    if (window.inHours <= 1 && requestCount > maxRequestsPerHour) {
      return false;
    }

    return true;
  }
}

/// Threat level enumeration
enum ThreatLevel { safe, medium, high }

/// Content security validation result
class ContentSecurityResult {
  ThreatLevel threatLevel = ThreatLevel.safe;
  List<String> threats = [];

  bool get isSafe => threatLevel == ThreatLevel.safe;

  String get summary {
    if (isSafe) {
      return 'Content is safe';
    }

    return 'Threats detected (${threatLevel.name}): ${threats.join(', ')}';
  }
}

/// File upload security validation result
class FileSecurityResult {
  bool isValid = true;
  List<String> errors = [];

  String get summary {
    if (isValid) {
      return 'File is safe for upload';
    }

    return 'File validation failed: ${errors.join(', ')}';
  }
}
