// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';

class AuthorProfileLink extends StatefulWidget {
  const AuthorProfileLink({
    super.key,
    required this.userId,
    required this.label,
    this.textStyle,
  });

  final String userId;
  final String label;
  final TextStyle? textStyle;

  @override
  State<AuthorProfileLink> createState() => _AuthorProfileLinkState();
}

class _AuthorProfileLinkState extends State<AuthorProfileLink> {
  bool _openingProfile = false;

  Future<void> _openProfile() async {
    if (_openingProfile) return;
    final router = GoRouter.maybeOf(context);
    final navigator = router == null ? Navigator.maybeOf(context) : null;
    if (router == null && navigator == null) return;

    setState(() => _openingProfile = true);
    try {
      final userId = widget.userId.trim();
      if (router != null) {
        await router.pushNamed<void>(
          'profile',
          pathParameters: {'userId': userId},
        );
      } else {
        await navigator!.push<void>(
          MaterialPageRoute<void>(
            builder: (_) => ProfileScreen(userId: userId),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _openingProfile = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final userId = widget.userId.trim();
    if (userId.isEmpty) return Text(widget.label, style: widget.textStyle);

    final scheme = Theme.of(context).colorScheme;
    return Tooltip(
      message: 'View ${widget.label} profile',
      child: TextButton(
        onPressed: _openingProfile ? null : _openProfile,
        style: TextButton.styleFrom(
          alignment: Alignment.centerLeft,
          foregroundColor: scheme.primary,
          minimumSize: const Size(0, 48),
          padding: EdgeInsets.zero,
          tapTargetSize: MaterialTapTargetSize.padded,
          textStyle: widget.textStyle?.copyWith(
            decoration: TextDecoration.underline,
            decorationColor: scheme.primary,
          ),
        ),
        child: Text(widget.label, maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
    );
  }
}
