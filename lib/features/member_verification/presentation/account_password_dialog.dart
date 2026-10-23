// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:lythaus/features/member_verification/application/recent_account_action.dart';

Future<String?> showAccountPasswordDialog(
  BuildContext context,
  Future<String> Function(String) verify,
  CancelToken cancellation,
) => showDialog<String>(
  context: context,
  barrierDismissible: false,
  builder: (_) => _PasswordDialog(verify, cancellation),
);

class _PasswordDialog extends StatefulWidget {
  const _PasswordDialog(this.verify, this.cancellation);
  final Future<String> Function(String) verify;
  final CancelToken cancellation;
  @override
  State<_PasswordDialog> createState() => _PasswordDialogState();
}

class _PasswordDialogState extends State<_PasswordDialog> {
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    widget.cancellation.whenCancel.then((_) => _close());
    _lifecycle = AppLifecycleListener(
      onStateChange: (state) {
        if (state == AppLifecycleState.hidden ||
            state == AppLifecycleState.paused ||
            state == AppLifecycleState.detached) {
          _cancel();
        }
      },
    );
  }

  void _close() {
    if (!mounted) return;
    final route = ModalRoute.of(context);
    if (route != null && route.isActive) {
      Navigator.of(context).removeRoute(route);
    }
  }

  void _cancel() {
    widget.cancellation.cancel('verification_cancelled');
    _close();
  }

  Future<void> _submit() async {
    if (_busy || _password.text.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final password = _password.text;
    _password.clear();
    try {
      final proof = await widget.verify(password);
      if (mounted && !widget.cancellation.isCancelled) {
        Navigator.of(context).pop(proof);
      }
    } catch (error) {
      if (mounted && !widget.cancellation.isCancelled) {
        setState(() {
          _busy = false;
          _error = error is RecentAccountActionException
              ? error.message
              : 'Verification could not be confirmed. Try again later.';
        });
      }
    }
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) _cancel();
    },
    child: AlertDialog(
      title: const Text('Verify your account'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Use your existing account password to confirm this action. Verification lasts up to 5 minutes for this action only. You can cancel and continue browsing.',
            ),
            TextField(
              controller: _password,
              obscureText: true,
              enabled: !_busy,
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(labelText: 'Account password'),
              onSubmitted: (_) => _submit(),
            ),
            if (_busy)
              Semantics(
                label: 'Verifying account',
                child: const LinearProgressIndicator(),
              ),
            if (_error != null)
              Semantics(liveRegion: true, child: Text(_error!)),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _cancel, child: const Text('Cancel')),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: const Text('Verify and continue'),
        ),
      ],
    ),
  );
}
