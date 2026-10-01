// ignore_for_file: public_member_api_docs

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/scheduler.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';
import 'package:lythaus/features/auth/domain/password_policy.dart';
import 'package:lythaus/features/auth/presentation/invite_redeem_screen.dart';
import 'package:lythaus/screens/security_debug_screen.dart';

class AuthChoiceScreen extends ConsumerStatefulWidget {
  const AuthChoiceScreen({super.key, this.launchAuthPage});

  final Future<bool> Function(Uri)? launchAuthPage;

  @override
  ConsumerState<AuthChoiceScreen> createState() => _AuthChoiceScreenState();
}

class _AuthChoiceScreenState extends ConsumerState<AuthChoiceScreen> {
  static final _signupUri = Uri.parse('https://lythaus.co/signup');
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  late final AnalyticsClient _analyticsClient;
  bool _screenViewLogged = false;
  bool _obscurePassword = true;
  bool _isRecoveryActionLoading = false;
  bool _isSignInPending = false;

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
    _track(
      AnalyticsEvents.screenView,
      properties: {
        AnalyticsEvents.propScreenName: 'auth_choice',
        AnalyticsEvents.propReferrer: 'app_entry',
      },
    );
    _screenViewLogged = true;
  }

  void _track(String event, {Map<String, Object?>? properties}) {
    unawaited(
      Future<void>.sync(
        () => _analyticsClient.logEvent(event, properties: properties),
      ).timeout(const Duration(seconds: 2)).catchError((Object _) {}),
    );
  }

  Future<bool> _launch(Uri uri) =>
      (widget.launchAuthPage?.call(uri) ??
              launchUrl(
                uri,
                mode: kIsWeb
                    ? LaunchMode.platformDefault
                    : LaunchMode.externalApplication,
                webOnlyWindowName: kIsWeb ? '_self' : null,
              ))
          .timeout(const Duration(seconds: 10));

  Future<void> _handleEmailSignIn() async {
    if (ref.read(authStateProvider).isLoading ||
        _isRecoveryActionLoading ||
        _isSignInPending) {
      return;
    }
    FocusScope.of(context).unfocus();
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (!_isValidEmail(email) || !PasswordPolicy.acceptsLogin(password)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter a valid email and your existing password.'),
        ),
      );
      return;
    }
    _track(
      AnalyticsEvents.authStarted,
      properties: {AnalyticsEvents.propMethod: 'email'},
    );
    if (!mounted) return;
    setState(() => _isSignInPending = true);
    try {
      await runWithDeviceGuard(
        context,
        ref,
        IntegrityUseCase.signIn,
        () => ref
            .read(authStateProvider.notifier)
            .signInWithEmail(email, password),
      );
    } finally {
      if (mounted) setState(() => _isSignInPending = false);
    }
    if (!mounted) return;
    if (ref.read(authStateProvider).valueOrNull != null) {
      _track(
        AnalyticsEvents.authCompleted,
        properties: {
          AnalyticsEvents.propMethod: 'email',
          AnalyticsEvents.propIsNewUser: false,
        },
      );
    }
  }

  Future<void> _handleGuestContinue() async {
    _track(
      AnalyticsEvents.authChoiceSelected,
      properties: {AnalyticsEvents.propMethod: 'guest'},
    );
    await ref.read(authStateProvider.notifier).continueAsGuest();
    _track(
      AnalyticsEvents.authCompleted,
      properties: {
        AnalyticsEvents.propMethod: 'guest',
        AnalyticsEvents.propIsNewUser: false,
      },
    );
  }

  bool _isValidEmail(String value) {
    return value.length <= 320 &&
        RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value);
  }

  Future<void> _openPasswordReset() async {
    final uri = Uri.https('lythaus.co', '/forgot-password');
    try {
      final opened = await _launch(uri);
      if (!opened && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to open password recovery.')),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to open password recovery.')),
      );
    }
  }

  Future<void> _openResendVerification() async {
    final uri = Uri.https('lythaus.co', '/resend-verification');
    try {
      final opened = await _launch(uri);
      if (!opened && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to open email verification.')),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to open email verification.')),
      );
    }
  }

  Future<void> _handleResendVerificationEmail() async {
    setState(() => _isRecoveryActionLoading = true);
    _track(
      AnalyticsEvents.authStarted,
      properties: {AnalyticsEvents.propMethod: 'resend_verification'},
    );
    try {
      await _openResendVerification();
    } finally {
      if (mounted) setState(() => _isRecoveryActionLoading = false);
    }
  }

  Future<void> _openSignup() async {
    try {
      if (await _launch(_signupUri)) return;
    } catch (_) {
      // The bounded launch failure is reported below.
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to open account creation.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final error = authState.hasError
        ? (authState.error is AuthFailure
              ? (authState.error! as AuthFailure).message
              : 'Unable to sign in. Check your details and connection, then try again.')
        : null;
    final isBusy =
        authState.isLoading || _isRecoveryActionLoading || _isSignInPending;
    return ReadingPane(
      child: Scaffold(
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
                        'Create a verified email account, sign in, or browse as a guest.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 28),
                      TextField(
                        controller: _emailController,
                        enabled: !isBusy,
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
                        enabled: !isBusy,
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
                        Semantics(
                          liveRegion: true,
                          child: Text(
                            error,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),
                      LythButton.primary(
                        label: authState.isLoading || _isSignInPending
                            ? 'Signing in…'
                            : 'Sign in with email',
                        icon: Icons.login,
                        onPressed: isBusy ? null : _handleEmailSignIn,
                      ),
                      const SizedBox(height: 12),
                      LythButton.tertiary(
                        label: 'Forgot password?',
                        icon: Icons.lock_reset,
                        onPressed: isBusy ? null : _openPasswordReset,
                      ),
                      LythButton.tertiary(
                        label: _isRecoveryActionLoading
                            ? 'Opening verification…'
                            : 'Resend verification email',
                        onPressed: isBusy
                            ? null
                            : _handleResendVerificationEmail,
                      ),
                      const SizedBox(height: 12),
                      LythButton.secondary(
                        label: 'Create account',
                        icon: Icons.person_add_alt_1,
                        onPressed: isBusy ? null : _openSignup,
                      ),
                      const SizedBox(height: 12),
                      LythButton.secondary(
                        label: 'Continue as guest',
                        onPressed: isBusy ? null : _handleGuestContinue,
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
      ),
    );
  }
}
