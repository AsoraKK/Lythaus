// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/core/routing/auth_return_location.dart';
import 'package:lythaus/features/auth/presentation/auth_choice_screen.dart';

class SignInRequired extends StatelessWidget {
  const SignInRequired({
    super.key,
    required this.message,
    required this.returnTo,
  });

  final String message;
  final String returnTo;

  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () {
              final router = GoRouter.maybeOf(context);
              if (router != null) {
                router.go(signInLocation(returnTo, accountEntry: true));
              } else {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (entryContext) => AuthChoiceScreen(
                      onSignedIn: () => Navigator.of(entryContext).pop(),
                      onContinueAsGuest: () => Navigator.of(entryContext).pop(),
                    ),
                  ),
                );
              }
            },
            child: const Text('Sign in'),
          ),
        ],
      ),
    ),
  );
}
