// Diagnostic component presentation through the app's existing Navigator.
// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';

const onboardingComponentRouteName = 'diagnostic-onboarding-component';

PageRoute<void> onboardingComponentRoute() => PageRouteBuilder<void>(
  settings: const RouteSettings(name: onboardingComponentRouteName),
  transitionDuration: Duration.zero,
  reverseTransitionDuration: Duration.zero,
  requestFocus: false,
  pageBuilder: (context, animation, secondaryAnimation) => MediaQuery(
    data: MediaQuery.of(context).copyWith(disableAnimations: true),
    child: Builder(
      builder: (context) => OnboardingIntroScreen(
        onContinue: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => const Scaffold(
              body: Center(child: Text('Synthetic continuation completed')),
            ),
          ),
        ),
      ),
    ),
  ),
);
