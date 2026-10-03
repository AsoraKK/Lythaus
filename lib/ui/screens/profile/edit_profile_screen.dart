// ignore_for_file: public_member_api_docs

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/core/routing/auth_return_location.dart';
import 'package:uuid/uuid.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/application/profile_validator.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({
    super.key,
    required this.profile,
    this.onboarding = false,
    this.onboardingReturnTo = '/',
  });

  final OwnerProfile profile;
  final bool onboarding;
  final String onboardingReturnTo;

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  late final TextEditingController _displayName;
  late final TextEditingController _bio;
  final _formKey = GlobalKey<FormState>();
  CancelToken? _cancelToken;
  String? _saveFingerprint;
  String? _saveKey;
  String? _error;
  bool _saving = false;
  bool _leaving = false;
  bool _allowPop = false;
  late final int _openedRevision;

  bool get _hasChanges =>
      _displayName.text.trim() != widget.profile.user.displayName.trim() ||
      _bio.text.trim() != (widget.profile.user.bio ?? '').trim();

  bool get _isOwner =>
      ref.read(authSessionRevisionProvider.notifier).revision ==
          _openedRevision &&
      ref.read(currentUserProvider)?.id == widget.profile.user.id;

  @override
  void initState() {
    super.initState();
    _openedRevision = ref.read(authSessionRevisionProvider.notifier).revision;
    _displayName = TextEditingController(text: widget.profile.user.displayName);
    _bio = TextEditingController(text: widget.profile.user.bio ?? '');
  }

  @override
  void dispose() {
    _displayName.dispose();
    _bio.dispose();
    _cancelToken?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(authSessionRevisionProvider);
    final user = ref.watch(currentUserProvider);
    ref.listen(currentUserProvider, (_, next) {
      if (next?.id != widget.profile.user.id) {
        _cancelToken?.cancel();
        _displayName.clear();
        _bio.clear();
      }
    });
    ref.listen(authSessionRevisionProvider, (_, next) {
      if (next != _openedRevision) {
        _cancelToken?.cancel();
        _displayName.clear();
        _bio.clear();
        _saveFingerprint = null;
        _saveKey = null;
      }
    });
    if (!_isOwner || user?.id != widget.profile.user.id) {
      return Scaffold(
        body: Center(
          child: Text(
            user?.id == widget.profile.user.id
                ? 'Your session changed. Reopen your profile to edit.'
                : 'Sign in to edit your profile.',
          ),
        ),
      );
    }
    return PopScope(
      canPop: _allowPop || (!widget.onboarding && !_hasChanges && !_saving),
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: ReadingPane(
        child: Scaffold(
          appBar: AppBar(
            leading: BackButton(onPressed: _saving ? null : _leave),
            title: Text(
              widget.onboarding
                  ? 'Set up your profile (optional)'
                  : 'Edit profile',
            ),
          ),
          body: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(Spacing.md),
              children: [
                const Text(
                  'Add what you like, then save. You can return from Profile at any time.',
                ),
                const SizedBox(height: Spacing.md),
                if (widget.profile.hasDetails) ...[
                  Text(widget.profile.statusMessage),
                  const SizedBox(height: Spacing.md),
                ],
                TextFormField(
                  controller: _displayName,
                  enabled: !_saving,
                  maxLength: 160,
                  onChanged: (_) => setState(() => _error = null),
                  validator: (value) =>
                      (value ?? '').trim().isEmpty &&
                          widget.profile.user.displayName.trim().isEmpty
                      ? null
                      : ProfileValidator.validateDisplayName(value),
                  decoration: const InputDecoration(
                    labelText: 'Display name (optional)',
                  ),
                ),
                const SizedBox(height: Spacing.sm),
                TextFormField(
                  controller: _bio,
                  enabled: !_saving,
                  maxLength: 2000,
                  maxLines: 5,
                  onChanged: (_) => setState(() => _error = null),
                  validator: ProfileValidator.validateBio,
                  decoration: const InputDecoration(
                    labelText: 'Bio (optional)',
                  ),
                ),
                if (_error != null)
                  Semantics(liveRegion: true, child: Text(_error!)),
                const SizedBox(height: Spacing.md),
                FilledButton.icon(
                  onPressed: _saving || !_hasChanges ? null : _save,
                  icon: _saving
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: const Text('Save profile'),
                ),
                if (widget.onboarding)
                  TextButton(
                    onPressed: _saving ? null : _leave,
                    child: const Text('Skip and explore'),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _leave() async {
    if (_saving || _leaving) return;
    _leaving = true;
    if (_hasChanges) {
      final discard = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Discard unsaved changes?'),
          content: const Text(
            'Your details are saved only when you choose Save profile.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep editing'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Discard changes'),
            ),
          ],
        ),
      );
      if (!mounted || !_isOwner || discard != true) {
        _leaving = false;
        return;
      }
    }
    if (mounted && _isOwner) _finish();
    _leaving = false;
  }

  void _finish() {
    setState(() => _allowPop = true);
    if (widget.onboarding) {
      ref.read(profileSetupRequestedProvider.notifier).state = false;
      context.go(safeAuthReturn(widget.onboardingReturnTo));
    } else {
      Navigator.of(context).pop();
    }
  }

  Future<void> _save() async {
    if (_saving ||
        !_isOwner ||
        !_hasChanges ||
        !_formKey.currentState!.validate()) {
      return;
    }
    final name = _displayName.text.trim();
    final bio = _bio.text.trim();
    final data = <String, String>{
      if (name != widget.profile.user.displayName.trim()) 'displayName': name,
      if (bio != (widget.profile.user.bio ?? '').trim()) 'bio': bio,
    };
    final fingerprint = jsonEncode(data);
    if (_saveFingerprint != fingerprint) {
      _saveFingerprint = fingerprint;
      _saveKey = const Uuid().v4();
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    _cancelToken = CancelToken();
    final stop = ref
        .read(authSessionRevisionProvider.notifier)
        .cancelOnChange(_cancelToken!.cancel);
    try {
      final token = await Future.any<String?>([
        ref.read(jwtProvider.future),
        _cancelToken!.whenCancel.then<String?>((error) => throw error),
      ]);
      if (!mounted || !_isOwner || _cancelToken!.isCancelled) return;
      if (token == null || token.isEmpty) {
        setState(() => _error = 'Your session expired. Sign in again to save.');
        return;
      }
      final response = await ref
          .read(secureDioProvider)
          .patch<Map<String, dynamic>>(
            '/api/users/me',
            data: data,
            cancelToken: _cancelToken,
            options: Options(
              headers: {
                'Authorization': 'Bearer $token',
                'Idempotency-Key': _saveKey,
              },
            ),
          );
      if (!mounted || !_isOwner || _cancelToken!.isCancelled) return;
      final saved = OwnerProfile.fromJson(response.data ?? const {});
      if (saved.user.id != widget.profile.user.id) {
        throw const FormatException('Invalid saved profile');
      }
      invalidateOwnerProfileProjections(ref, saved.user.id);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(saved.statusMessage)));
      _finish();
    } on DioException catch (error) {
      if (mounted && _isOwner && !CancelToken.isCancel(error)) {
        final response = error.response;
        final body = response?.data;
        final code = body is Map ? body['error'] : null;
        setState(
          () => _error = switch (code) {
            'invalid_display_name' => 'Please choose a different display name.',
            'invalid_bio' => 'Check your bio and try again.',
            'idempotency_outcome_unknown' || 'idempotency_in_progress' =>
              'The save is not confirmed. Check your saved profile before trying again.',
            _ when response?.statusCode == 401 =>
              'Your session expired. Sign in again to save.',
            _ =>
              'Unable to save your profile. Your edits are still here; try again.',
          },
        );
      }
    } catch (_) {
      if (mounted && _isOwner) {
        setState(
          () =>
              _error = 'Unable to confirm the save. Your edits are still here.',
        );
      }
    } finally {
      stop();
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }
}
