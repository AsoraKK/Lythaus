// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/auth_failure.dart';

class PasskeysScreen extends ConsumerStatefulWidget {
  const PasskeysScreen({super.key});
  @override
  ConsumerState<PasskeysScreen> createState() => _PasskeysScreenState();
}

class _PasskeysScreenState extends ConsumerState<PasskeysScreen> {
  List<PasskeyInfo>? _credentials;
  bool _busy = false;
  String? _message;
  AuthService get _service => ref.read(enhancedAuthServiceProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final credentials = await _service.listPasskeys();
      if (mounted) setState(() => _credentials = credentials);
    } catch (_) {
      if (mounted) {
        setState(
          () => _message =
              'Unable to load passkeys. Email and password remain available.',
        );
      }
    }
  }

  Future<void> _run(Future<void> Function() action, String success) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await action();
      if (mounted) setState(() => _message = success);
      if (mounted) await _load();
    } catch (error) {
      if (mounted) {
        setState(
          () => _message = error is AuthFailure
              ? error.message
              : 'Passkey action was cancelled or unavailable. Try again or use email and password.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _edit({PasskeyInfo? credential, bool revoke = false}) async {
    final name = TextEditingController(text: credential?.name ?? 'My passkey');
    final password = TextEditingController();
    try {
      final accepted = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(
            revoke
                ? 'Remove passkey'
                : credential == null
                ? 'Add a passkey'
                : 'Rename passkey',
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (!revoke)
                TextField(
                  controller: name,
                  maxLength: 64,
                  decoration: const InputDecoration(labelText: 'Name'),
                ),
              if (credential == null || revoke)
                TextField(
                  controller: password,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Current password',
                  ),
                ),
              if (revoke)
                const Text(
                  'Removing this passkey signs out all sessions. You can sign in with email and password.',
                ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(revoke ? 'Remove' : 'Save'),
            ),
          ],
        ),
      );
      if (accepted != true || !mounted) return;
      final selectedName = name.text.trim();
      final suppliedPassword = password.text;
      password.clear();
      await _run(
        () async {
          if (revoke) {
            await _service.revokePasskey(credential!.id, suppliedPassword);
            await ref.read(authStateProvider.notifier).signOut();
            if (mounted) {
              Navigator.of(context).popUntil((route) => route.isFirst);
            }
          } else if (credential == null) {
            await _service.enrollPasskey(selectedName, suppliedPassword);
          } else {
            await _service.renamePasskey(credential.id, selectedName);
          }
        },
        revoke
            ? 'Passkey removed. Sign in again with email or another passkey.'
            : 'Passkey saved.',
      );
    } finally {
      name.dispose();
      password.dispose();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Passkeys')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Text(
              'Passkeys are optional. Your device confirms with a PIN or biometric. Lythaus receives a cryptographic proof, never biometric data. Email and password remain available.',
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _busy ? null : () => _edit(),
              icon: const Icon(Icons.add),
              label: const Text('Add a passkey'),
            ),
            if (_credentials?.isNotEmpty == true)
              OutlinedButton.icon(
                onPressed: _busy
                    ? null
                    : () => _run(
                        _service.verifyPasskeyMaintenance,
                        'Passkey verified.',
                      ),
                icon: const Icon(Icons.verified_user_outlined),
                label: const Text('Verify an existing passkey'),
              ),
            if (_busy) const LinearProgressIndicator(),
            if (_message != null)
              Semantics(
                liveRegion: true,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Text(_message!),
                ),
              ),
            if (_credentials == null && _message == null)
              const Center(child: CircularProgressIndicator()),
            if (_credentials?.isEmpty == true)
              const Padding(
                padding: EdgeInsets.only(top: 16),
                child: Text('You have no passkeys yet.'),
              ),
            for (final credential in _credentials ?? <PasskeyInfo>[])
              ListTile(
                title: Text(credential.name),
                subtitle: Text(
                  credential.synced
                      ? 'Can sync between your devices'
                      : 'Stored on one authenticator',
                ),
                trailing: Wrap(
                  children: [
                    IconButton(
                      tooltip: 'Rename passkey',
                      onPressed: _busy
                          ? null
                          : () => _edit(credential: credential),
                      icon: const Icon(Icons.edit_outlined),
                    ),
                    IconButton(
                      tooltip: 'Remove passkey',
                      onPressed: _busy
                          ? null
                          : () => _edit(credential: credential, revoke: true),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
