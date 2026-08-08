// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/auth/presentation/invite_redeem_screen.dart';
import 'package:lythaus/ui/screens/app_shell.dart';
import 'package:lythaus/features/auth/presentation/auth_choice_screen.dart';

class AuthGate extends ConsumerStatefulWidget {
  const AuthGate({super.key});

  @override
  ConsumerState<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends ConsumerState<AuthGate> {
  bool _appStartedLogged = false;
  ProviderSubscription<AsyncValue<User?>>? _authStateSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _appStartedLogged) return;
      final analytics = ref.read(analyticsClientProvider);
      analytics.logEvent(AnalyticsEvents.appStarted);
      ref
          .read(analyticsEventTrackerProvider)
          .logEventOnce(analytics, AnalyticsEvents.onboardingStart);
      _appStartedLogged = true;
    });

    _authStateSub = ref.listenManual<AsyncValue<User?>>(authStateProvider, (
      previous,
      next,
    ) {
      final analytics = ref.read(analyticsClientProvider);
      final user = next.valueOrNull;
      analytics.setUserId(user?.id);

      // After a successful sign-in, open the invite redemption screen if a
      // code was saved while the user was unauthenticated.
      if (user != null && previous?.valueOrNull == null) {
        final pendingCode = ref.read(pendingInviteCodeProvider);
        if (pendingCode != null && pendingCode.isNotEmpty) {
          ref.read(pendingInviteCodeProvider.notifier).state = null;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => InviteRedeemScreen(inviteCode: pendingCode),
              ),
            );
          });
        }
      }
    });
  }

  @override
  void dispose() {
    _authStateSub?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final isGuest = ref.watch(guestModeProvider);

    return authState.when(
      data: (user) {
        return user != null || isGuest
            ? const LythausAppShell()
            : const AuthChoiceScreen();
      },
      loading: () => isGuest ? const LythausAppShell() : const AuthChoiceScreen(),
      error: (error, stack) =>
          isGuest ? const LythausAppShell() : const AuthChoiceScreen(),
    );
  }
}
