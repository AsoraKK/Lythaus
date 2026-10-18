// Diagnostic presentation only: no new GoRouter route or production entrypoint.
// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';

class OnboardingLifecycleHost extends StatelessWidget {
  const OnboardingLifecycleHost({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      ExcludeFocus(child: Offstage(child: child)),
      HeroControllerScope.none(
        child: Navigator(
          onGenerateRoute: (_) => MaterialPageRoute<void>(
            builder: (context) => OnboardingIntroScreen(
              onContinue: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const Scaffold(
                    body: Center(
                      child: Text('Synthetic continuation completed'),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ],
  );
}
