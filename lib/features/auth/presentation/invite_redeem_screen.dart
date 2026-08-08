// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/design_system/components/lyth_text_field.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';

class InviteRedeemScreen extends ConsumerStatefulWidget {
  const InviteRedeemScreen({super.key, this.inviteCode});

  final String? inviteCode;

  @override
  ConsumerState<InviteRedeemScreen> createState() => _InviteRedeemScreenState();
}

class _InviteRedeemScreenState extends ConsumerState<InviteRedeemScreen> {
  late final TextEditingController _controller;
  bool _isSubmitting = false;
  bool _screenLogged = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.inviteCode ?? '');
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _logScreenView();
      // Arriving at the invite screen means the pending-code redirect already
      // fired (or the user navigated directly). Clear the saved code so the
      // router does not loop back here after a subsequent rebuild.
      ref.read(pendingInviteCodeProvider.notifier).state = null;
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _logScreenView() {
    if (_screenLogged) return;
    ref
        .read(analyticsClientProvider)
        .logEvent(AnalyticsEvents.inviteScreenView);
    _screenLogged = true;
  }

  @override
  Widget build(BuildContext context) {
    final spacing = context.spacing;

    return Scaffold(
      appBar: AppBar(title: const Text('Redeem invite')),
      body: Padding(
        padding: EdgeInsets.all(spacing.xxl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Enter your invite code',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            SizedBox(height: spacing.sm),
            Text(
              'Invites unlock access to the Lythaus beta.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            SizedBox(height: spacing.lg),
            LythTextField(
              controller: _controller,
              label: 'Invite code',
              placeholder: 'XXXX-XXXX',
              onChanged: (_) {
                if (_error != null) {
                  setState(() => _error = null);
                }
              },
            ),
            if (_error != null) ...[
              SizedBox(height: spacing.sm),
              Text(
                _error!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            ],
            SizedBox(height: spacing.lg),
            LythButton.primary(
              label: _isSubmitting ? 'Redeeming...' : 'Redeem invite',
              isLoading: _isSubmitting,
              onPressed: _isSubmitting ? null : _redeemInvite,
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _redeemInvite() async {
    final code = _controller.text.trim();
    if (code.isEmpty) {
      setState(() => _error = 'Invite code is required.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _error = null;
    });

    final analytics = ref.read(analyticsClientProvider);

    try {
      final token = await ref.read(jwtProvider.future);
      if (token == null || token.isEmpty) {
        // Preserve the code through the login flow so the router redirects
        // back here once the user has authenticated.
        ref.read(pendingInviteCodeProvider.notifier).state = code;
        if (!mounted) return;
        LythSnackbar.info(
          context: context,
          message: 'Sign in first — your invite code has been saved.',
        );
        try {
          context.go('/login');
        } catch (_) {
          // GoRouter not in context (e.g. isolated widget tests).
          if (mounted) setState(() => _error = 'Sign in to redeem an invite.');
        }
        return;
      }

      final service = ref.read(inviteRedeemServiceProvider);
      await service.redeemInvite(accessToken: token, inviteCode: code);

      await analytics.logEvent(AnalyticsEvents.inviteRedeemSuccess);
      if (!mounted) return;
      LythSnackbar.success(
        context: context,
        message: 'Invite redeemed. Welcome to Lythaus.',
      );
      try {
        context.go('/');
      } catch (_) {
        // GoRouter not in context (e.g. isolated widget tests); pop instead.
        if (mounted && Navigator.of(context).canPop()) {
          Navigator.of(context).pop();
        }
      }
    } on DioException catch (error) {
      final reason = _mapInviteFailure(error);
      await analytics.logEvent(
        AnalyticsEvents.inviteRedeemFail,
        properties: {AnalyticsEvents.propInviteRedeemReason: reason.value},
      );
      setState(() => _error = _messageForInviteFailure(reason));
    } catch (_) {
      await analytics.logEvent(
        AnalyticsEvents.inviteRedeemFail,
        properties: {
          AnalyticsEvents.propInviteRedeemReason:
              InviteRedeemFailureReason.unknown.value,
        },
      );
      setState(
        () => _error = 'Invite could not be redeemed. Please check the code.',
      );
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  String _messageForInviteFailure(InviteRedeemFailureReason reason) {
    if (reason == InviteRedeemFailureReason.rateLimited) {
      return 'Too many invite redemption attempts. Please wait before trying again.';
    }
    return 'Invite could not be redeemed. Please check the code.';
  }

  InviteRedeemFailureReason _mapInviteFailure(DioException error) {
    if (error.response == null) {
      return InviteRedeemFailureReason.network;
    }
    final status = error.response?.statusCode;
    if (status == 401) {
      return InviteRedeemFailureReason.unauthorized;
    }
    if (status == 429) {
      return InviteRedeemFailureReason.rateLimited;
    }

    final data = error.response?.data;
    final message = data is Map<String, dynamic>
        ? (data['message'] as String? ??
              (data['error'] is String ? data['error'] as String : null))
        : null;

    switch (message) {
      case 'invalid_request':
      case 'invalid_code_format':
        return InviteRedeemFailureReason.invalidCode;
      case 'not_found':
        return InviteRedeemFailureReason.invalidCode;
      case 'expired':
        return InviteRedeemFailureReason.expired;
      case 'already_used':
        return InviteRedeemFailureReason.alreadyUsed;
      case 'exhausted':
        return InviteRedeemFailureReason.exhausted;
      case 'revoked':
        return InviteRedeemFailureReason.revoked;
      case 'email_mismatch':
        return InviteRedeemFailureReason.emailMismatch;
      case 'already_active':
        return InviteRedeemFailureReason.alreadyActive;
      case 'missing_email':
        return InviteRedeemFailureReason.missingEmail;
      default:
        return InviteRedeemFailureReason.unknown;
    }
  }
}
