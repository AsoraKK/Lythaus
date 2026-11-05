// ignore_for_file: public_member_api_docs

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/routing/invite_location_scrubber.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_text_field.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';

class InviteRedeemScreen extends ConsumerStatefulWidget {
  const InviteRedeemScreen({super.key, this.inviteCode});

  final String? inviteCode;

  @override
  ConsumerState<InviteRedeemScreen> createState() => _InviteRedeemScreenState();
}

class _InviteRedeemScreenState extends ConsumerState<InviteRedeemScreen> {
  late final TextEditingController _emailController;
  late final TextEditingController _codeController;
  late final TextEditingController _passwordController;
  bool _isSubmitting = false;
  bool _completed = false;
  bool _screenLogged = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController();
    _codeController = TextEditingController(text: widget.inviteCode ?? '');
    _passwordController = TextEditingController();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _logScreenView();
      final inviteCode = widget.inviteCode;
      if (inviteCode?.isNotEmpty == true && browserInvitePathNeedsScrubbing()) {
        // Replace the legacy secret-bearing route through GoRouter so its
        // route state cannot restore the original path after history scrubbing.
        ref.read(pendingInviteCodeProvider.notifier).state = inviteCode;
        context.replace('/invite');
        return;
      }
      // Arriving at the invite screen means the pending-code redirect already
      // fired (or the user navigated directly). Clear the saved code so the
      // router does not loop back here after a subsequent rebuild.
      ref.read(pendingInviteCodeProvider.notifier).state = null;
      _scrubInviteCodeFromBrowserUrl();
    });
  }

  @override
  void didUpdateWidget(covariant InviteRedeemScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    final code = widget.inviteCode;
    if (code == null || code.isEmpty || code == oldWidget.inviteCode) return;

    // GoRouter may first build the direct web route before it has delivered
    // the browser fragment. Preserve the code if it arrives in that update,
    // without overwriting anything the visitor has already typed.
    if (_codeController.text.isEmpty) {
      _codeController.value = TextEditingValue(
        text: code,
        selection: TextSelection.collapsed(offset: code.length),
      );
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.inviteCode == code) {
        _scrubInviteCodeFromBrowserUrl();
      }
    });
  }

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _logScreenView() {
    if (_screenLogged) return;
    _logEvent(
      ref.read(analyticsClientProvider),
      AnalyticsEvents.inviteScreenView,
    );
    _screenLogged = true;
  }

  void _scrubInviteCodeFromBrowserUrl() {
    if (widget.inviteCode?.isNotEmpty == true) {
      scrubInviteCodeFromBrowserUrl();
    }
  }

  void _logEvent(
    AnalyticsClient analytics,
    String event, {
    Map<String, Object?>? properties,
  }) {
    unawaited(
      Future<void>.sync(
        () => analytics.logEvent(event, properties: properties),
      ).catchError((Object _) {}),
    );
  }

  @override
  Widget build(BuildContext context) {
    final spacing = context.spacing;

    return ReadingPane(
      child: Scaffold(
        appBar: AppBar(title: const Text('Join Lythaus')),
        body: SafeArea(
          top: false,
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: EdgeInsets.all(spacing.xxl),
            child: Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: LythBrand(),
                    ),
                    SizedBox(height: spacing.xxl),
                    Semantics(
                      header: true,
                      child: Text(
                        'Enter your invite code',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    if (!_completed) ...[
                      SizedBox(height: spacing.sm),
                      Text(
                        'Use the email address that received your invitation, its one-time code, and a password to create your account.',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      SizedBox(height: spacing.lg),
                      LythTextField.email(
                        controller: _emailController,
                        label: 'Email address',
                        placeholder: 'you@example.com',
                        onChanged: _clearError,
                      ),
                      SizedBox(height: spacing.md),
                      LythTextField(
                        key: ValueKey<bool>(
                          widget.inviteCode?.isNotEmpty == true,
                        ),
                        controller: _codeController,
                        label: 'Invitation code',
                        placeholder: 'Paste your one-time code',
                        maxLength: 256,
                        onChanged: _clearError,
                        textInputAction: TextInputAction.next,
                      ),
                      SizedBox(height: spacing.md),
                      LythTextField.password(
                        controller: _passwordController,
                        label: 'Password',
                        placeholder: 'Create a password',
                        onChanged: _clearError,
                        onSubmitted: _submitAccount,
                      ),
                      if (_error != null) ...[
                        SizedBox(height: spacing.sm),
                        Semantics(
                          liveRegion: true,
                          child: Text(
                            _error!,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: Theme.of(context).colorScheme.error,
                                ),
                          ),
                        ),
                      ],
                      SizedBox(height: spacing.lg),
                      LythButton.primary(
                        label: _isSubmitting
                            ? 'Creating account…'
                            : 'Create account',
                        isLoading: _isSubmitting,
                        onPressed: _isSubmitting ? null : _submitAccount,
                      ),
                      SizedBox(height: spacing.md),
                      TextButton(
                        onPressed: () => context.go('/login'),
                        child: const Text('Already have an account? Sign in'),
                      ),
                    ] else ...[
                      SizedBox(height: spacing.sm),
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          'Your email is verified and your account is ready. Sign in with your email and password.',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ),
                      SizedBox(height: spacing.lg),
                      LythButton.primary(
                        label: 'Continue to sign in',
                        onPressed: () => context.go('/login'),
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

  void _clearError(String _) {
    if (_error != null) setState(() => _error = null);
  }

  Future<void> _submitAccount([String? _]) async {
    if (_isSubmitting || _completed) return;
    final email = _emailController.text.trim();
    final code = _codeController.text.trim();
    final password = _passwordController.text;
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) {
      setState(
        () => _error = 'Enter the email address your invitation was sent to.',
      );
      return;
    }
    if (code.isEmpty) {
      setState(() => _error = 'Invitation code is required.');
      return;
    }
    if (password.isEmpty) {
      setState(() => _error = 'Create a password to continue.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _error = null;
    });

    try {
      await ref
          .read(inviteRedeemServiceProvider)
          .redeemInvite(email: email, inviteCode: code, password: password);
      if (!mounted) return;
      _emailController.clear();
      _codeController.clear();
      _passwordController.clear();
      setState(() => _completed = true);
      _logEvent(
        ref.read(analyticsClientProvider),
        AnalyticsEvents.inviteRedeemSuccess,
      );
    } catch (error) {
      if (!mounted) return;
      final response = error is DioException ? error.response : null;
      final statusCode = response?.statusCode;
      final body = response?.data;
      final code = body is Map<String, dynamic> ? body['error'] : null;
      setState(
        () => _error = statusCode == 429 || code == 'rate_limited'
            ? 'Too many signup attempts. Please wait before trying again.'
            : 'We could not verify this invitation. Check the email address and code, or contact support for help.',
      );
      _logEvent(
        ref.read(analyticsClientProvider),
        AnalyticsEvents.inviteRedeemFail,
        properties: {
          'reason': statusCode == 429 ? 'rate_limited' : 'verification_failed',
        },
      );
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }
}
