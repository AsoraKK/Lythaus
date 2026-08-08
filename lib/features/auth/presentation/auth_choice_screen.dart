// ignore_for_file: public_member_api_docs

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/scheduler.dart';

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/presentation/invite_redeem_screen.dart';
import 'package:lythaus/screens/security_debug_screen.dart';

class AuthChoiceScreen extends ConsumerStatefulWidget {
  const AuthChoiceScreen({super.key});

  @override
  ConsumerState<AuthChoiceScreen> createState() => _AuthChoiceScreenState();
}

class _AuthChoiceScreenState extends ConsumerState<AuthChoiceScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  late final AnalyticsClient _analyticsClient;
  bool _screenViewLogged = false;
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    _analyticsClient = ref.read(analyticsClientProvider);
    SchedulerBinding.instance.addPostFrameCallback((_) => _logScreenView());
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _logScreenView() {
    if (_screenViewLogged) return;
    _analyticsClient.logEvent(
      AnalyticsEvents.screenView,
      properties: {
        AnalyticsEvents.propScreenName: 'auth_choice',
        AnalyticsEvents.propReferrer: 'app_entry',
      },
    );
    _screenViewLogged = true;
  }

  Future<void> _handleEmailSignIn() async {
    FocusScope.of(context).unfocus();
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || password.length < 12) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Enter a valid email and a password of at least 12 characters.',
          ),
        ),
      );
      return;
    }
    await _analyticsClient.logEvent(
      AnalyticsEvents.authStarted,
      properties: {AnalyticsEvents.propMethod: 'email'},
    );
    if (!mounted) return;
    await runWithDeviceGuard(
      context,
      ref,
      IntegrityUseCase.signIn,
      () =>
          ref.read(authStateProvider.notifier).signInWithEmail(email, password),
    );
    if (!mounted) return;
    if (ref.read(authStateProvider).valueOrNull != null) {
      await _analyticsClient.logEvent(
        AnalyticsEvents.authCompleted,
        properties: {
          AnalyticsEvents.propMethod: 'email',
          AnalyticsEvents.propIsNewUser: false,
        },
      );
    }
  }

  Future<void> _handleGuestContinue() async {
    await _analyticsClient.logEvent(
      AnalyticsEvents.authChoiceSelected,
      properties: {AnalyticsEvents.propMethod: 'guest'},
    );
    await ref.read(authStateProvider.notifier).continueAsGuest();
    await _analyticsClient.logEvent(
      AnalyticsEvents.authCompleted,
      properties: {
        AnalyticsEvents.propMethod: 'guest',
        AnalyticsEvents.propIsNewUser: false,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final error = authState.hasError ? authState.error.toString() : null;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 32,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(Icons.auto_awesome, size: 56),
                    const SizedBox(height: 12),
                    Text(
                      'Welcome to Lythaus',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Browse as a guest or sign in with your verified email.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 28),
                    TextField(
                      controller: _emailController,
                      enabled: !authState.isLoading,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        prefixIcon: Icon(Icons.email_outlined),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _passwordController,
                      enabled: !authState.isLoading,
                      obscureText: _obscurePassword,
                      autofillHints: const [AutofillHints.password],
                      onSubmitted: (_) => _handleEmailSignIn(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        prefixIcon: const Icon(Icons.lock_outline),
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          tooltip: _obscurePassword
                              ? 'Show password'
                              : 'Hide password',
                          onPressed: () => setState(
                            () => _obscurePassword = !_obscurePassword,
                          ),
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                    ),
                    if (error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        error,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    LythButton.primary(
                      label: authState.isLoading
                          ? 'Signing in…'
                          : 'Sign in with email',
                      icon: Icons.login,
                      onPressed: authState.isLoading
                          ? null
                          : _handleEmailSignIn,
                    ),
                    const SizedBox(height: 12),
                    LythButton.secondary(
                      label: 'Continue as guest',
                      onPressed: authState.isLoading
                          ? null
                          : _handleGuestContinue,
                    ),
                    const SizedBox(height: 20),
                    LythButton.tertiary(
                      label: 'Redeem invite',
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => const InviteRedeemScreen(),
                        ),
                      ),
                    ),
                    if (kDebugMode) ...[
                      const SizedBox(height: 12),
                      LythButton.secondary(
                        label: 'Security Debug',
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => const SecurityDebugScreen(),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
