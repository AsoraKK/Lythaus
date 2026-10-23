import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/member_verification/application/recent_account_action.dart';
import 'package:lythaus/features/member_verification/presentation/account_password_dialog.dart';
import 'lifecycle_test_support.dart';

void main() {
  for (final cancelKind in ['button', 'account', 'background']) {
    testWidgets('$cancelKind cancels verification and discards late success', (
      tester,
    ) async {
      final cancellation = CancelToken();
      final verification = Completer<String>();
      String? result;
      var submitted = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                result = await showAccountPasswordDialog(context, (_) {
                  submitted++;
                  return verification.future;
                }, cancellation);
              },
              child: const Text('Request action'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Request action'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).obscureText,
        isTrue,
      );
      await tester.enterText(find.byType(TextField), 'existing password');
      await tester.tap(find.text('Verify and continue'));
      await tester.pump();
      expect(submitted, 1);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );
      if (cancelKind == 'button') await tester.tap(find.text('Cancel'));
      if (cancelKind == 'account') cancellation.cancel('account_changed');
      if (cancelKind == 'background') backgroundApp(tester);
      await tester.pumpAndSettle();
      verification.complete('late-proof');
      await tester.pumpAndSettle();
      expect(result, isNull);
      expect(cancellation.isCancelled, isTrue);
      expect(find.text('Verify your account'), findsNothing);
      expect(find.text('Request action'), findsOneWidget);
      resumeApp(tester);
    });
  }

  testWidgets(
    'wrong password error is accessible, clears input and allows deliberate retry',
    (tester) async {
      var attempts = 0;
      String? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                result = await showAccountPasswordDialog(context, (_) async {
                  attempts++;
                  if (attempts == 1) {
                    throw const RecentAccountActionException(
                      'Password verification failed.',
                    );
                  }
                  return 'server-proof';
                }, CancelToken());
              },
              child: const Text('Request action'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Request action'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'wrong');
      await tester.tap(find.text('Verify and continue'));
      await tester.pumpAndSettle();
      expect(find.text('Password verification failed.'), findsOneWidget);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
      await tester.enterText(find.byType(TextField), 'correct');
      await tester.tap(find.text('Verify and continue'));
      await tester.pumpAndSettle();
      expect(result, 'server-proof');
      expect(attempts, 2);
    },
  );
}
