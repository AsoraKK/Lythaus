import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';

void main() {
  group('AuthFailure', () {
    test('implements Exception', () {
      final failure = AuthFailure.cancelledByUser();
      expect(failure, isA<Exception>());
    });

    group('factory constructors', () {
      test('cancelledByUser creates failure with correct message', () {
        final failure = AuthFailure.cancelledByUser();
        expect(failure.message, equals('Cancelled by user'));
        expect(failure.toString(), equals('Cancelled by user'));
      });

      test('serverError creates failure with default message', () {
        final failure = AuthFailure.serverError();
        expect(failure.message, equals('Server error'));
        expect(failure.toString(), equals('Server error'));
      });

      test('serverError creates failure with custom message', () {
        final failure = AuthFailure.serverError('Custom server error');
        expect(failure.message, equals('Custom server error'));
        expect(failure.toString(), equals('Custom server error'));
      });

      test('invalidCredentials creates failure with default message', () {
        final failure = AuthFailure.invalidCredentials();
        expect(failure.message, equals('Invalid credentials'));
        expect(failure.toString(), equals('Invalid credentials'));
      });

      test('invalidCredentials creates failure with custom message', () {
        final failure = AuthFailure.invalidCredentials('Wrong password');
        expect(failure.message, equals('Wrong password'));
        expect(failure.toString(), equals('Wrong password'));
      });

      test('networkError creates failure with default message', () {
        final failure = AuthFailure.networkError();
        expect(failure.message, equals('Network error'));
        expect(failure.toString(), equals('Network error'));
      });

      test('networkError creates failure with custom message', () {
        final failure = AuthFailure.networkError('Connection timeout');
        expect(failure.message, equals('Connection timeout'));
        expect(failure.toString(), equals('Connection timeout'));
      });

      test('platformError creates failure with default message', () {
        final failure = AuthFailure.platformError();
        expect(failure.message, equals('Platform error'));
        expect(failure.toString(), equals('Platform error'));
      });

      test('platformError creates failure with custom message', () {
        final failure = AuthFailure.platformError('Platform not supported');
        expect(failure.message, equals('Platform not supported'));
        expect(failure.toString(), equals('Platform not supported'));
      });
    });

    group('toString', () {
      test('returns the message', () {
        final failure = AuthFailure.serverError('Test message');
        expect(failure.toString(), equals('Test message'));
      });
    });

    group('message property', () {
      test('provides access to the failure message', () {
        final failure = AuthFailure.networkError('No internet connection');
        expect(failure.message, equals('No internet connection'));
      });
    });
  });
}
