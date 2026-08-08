// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/features/feed/presentation/create_post_screen.dart';

class CreateModalScreen extends StatelessWidget {
  const CreateModalScreen({super.key});

  static Future<void> show(BuildContext context) {
    return Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => const CreatePostScreen(),
        fullscreenDialog: true,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const CreatePostScreen();
  }
}
