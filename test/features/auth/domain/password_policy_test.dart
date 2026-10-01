import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/domain/password_policy.dart';

void main() {
  test('Dart and API share code-point password fixtures', () {
    final policy =
        jsonDecode(
              File(
                'packages/contracts/fixtures/password-policy.json',
              ).readAsStringSync(),
            )
            as Map<String, dynamic>;
    expect(PasswordPolicy.newPasswordMin, policy['newPasswordMin']);
    expect(PasswordPolicy.loginPasswordMin, policy['loginPasswordMin']);
    expect(PasswordPolicy.passwordMax, policy['passwordMax']);
    for (final fixture in policy['cases'] as List<dynamic>) {
      final row = fixture as Map<String, dynamic>;
      expect(
        PasswordPolicy.acceptsLogin(row['password'] as String),
        row['login'],
        reason: row['name'] as String,
      );
      expect(
        PasswordPolicy.acceptsNew(row['password'] as String),
        row['creation'],
        reason: row['name'] as String,
      );
    }
    expect(PasswordPolicy.acceptsNew('😀' * 128), isTrue);
    expect(PasswordPolicy.acceptsNew('😀' * 129), isFalse);
  });
}
