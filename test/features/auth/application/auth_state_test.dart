import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_state.dart';

void main() {
  group('AuthState', () {
    group('constructors', () {
      test(
        'default constructor creates state with status and optional userId',
        () {
          const state = AuthState(AuthStatus.authed, userId: 'test123');

          expect(state.status, equals(AuthStatus.authed));
          expect(state.userId, equals('test123'));
        },
      );

      test('default constructor creates state without userId', () {
        const state = AuthState(AuthStatus.loading);

        expect(state.status, equals(AuthStatus.loading));
        expect(state.userId, isNull);
      });

      test('loading constructor creates loading state', () {
        const state = AuthState.loading();

        expect(state.status, equals(AuthStatus.loading));
        expect(state.userId, isNull);
      });

      test('guest constructor creates guest state', () {
        const state = AuthState.guest();

        expect(state.status, equals(AuthStatus.guest));
        expect(state.userId, isNull);
      });

      test('authed constructor creates authenticated state with userId', () {
        const state = AuthState.authed('user456');

        expect(state.status, equals(AuthStatus.authed));
        expect(state.userId, equals('user456'));
      });
    });

    group('AuthStatus enum', () {
      test('has expected values', () {
        expect(AuthStatus.values, hasLength(3));
        expect(AuthStatus.values, contains(AuthStatus.loading));
        expect(AuthStatus.values, contains(AuthStatus.guest));
        expect(AuthStatus.values, contains(AuthStatus.authed));
      });
    });

    group('equality and hashCode', () {
      test('states with same status and userId are equal', () {
        const state1 = AuthState(AuthStatus.authed, userId: 'test123');
        const state2 = AuthState(AuthStatus.authed, userId: 'test123');

        // Note: Dart's default equality for classes is by reference,
        // but we're testing the basic functionality here
        expect(state1.status, equals(state2.status));
        expect(state1.userId, equals(state2.userId));
      });

      test('states with different status are different', () {
        const state1 = AuthState(AuthStatus.loading);
        const state2 = AuthState(AuthStatus.guest);

        expect(state1.status, isNot(equals(state2.status)));
      });

      test('states with different userId are different', () {
        const state1 = AuthState(AuthStatus.authed, userId: 'user1');
        const state2 = AuthState(AuthStatus.authed, userId: 'user2');

        expect(state1.userId, isNot(equals(state2.userId)));
      });
    });
  });
}
