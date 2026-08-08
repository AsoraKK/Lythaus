// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key, required this.profile});

  final PublicUser profile;

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  late final TextEditingController _displayName;
  late final TextEditingController _bio;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _displayName = TextEditingController(text: widget.profile.displayName);
    _bio = TextEditingController(text: widget.profile.bio ?? '');
  }

  @override
  void dispose() {
    _displayName.dispose();
    _bio.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit profile')),
      body: ListView(
        padding: const EdgeInsets.all(Spacing.md),
        children: [
          TextField(
            controller: _displayName,
            maxLength: 80,
            decoration: const InputDecoration(labelText: 'Display name'),
          ),
          const SizedBox(height: Spacing.sm),
          TextField(
            controller: _bio,
            maxLength: 500,
            maxLines: 5,
            decoration: const InputDecoration(labelText: 'Bio'),
          ),
          const SizedBox(height: Spacing.md),
          FilledButton.icon(
            onPressed: _saving ? null : _save,
            icon: _saving
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: const Text('Save profile'),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    final name = _displayName.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Display name is required.')),
      );
      return;
    }
    final token = await ref.read(jwtProvider.future);
    if (token == null || token.isEmpty) {
      return;
    }
    setState(() => _saving = true);
    try {
      await ref
          .read(secureDioProvider)
          .patch<Map<String, dynamic>>(
            '/api/users/me',
            data: {'displayName': name, 'bio': _bio.text.trim()},
            options: Options(headers: {'Authorization': 'Bearer $token'}),
          );
      ref.invalidate(publicUserProvider(widget.profile.id));
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Profile updated.')));
        Navigator.of(context).pop();
      }
    } on DioException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Unable to update profile.')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }
}
