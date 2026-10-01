// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

class PrivacyBlockingOverlay extends StatelessWidget {
  const PrivacyBlockingOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: ColoredBox(
        color: Theme.of(context).colorScheme.surface,
        child: const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 12),
              Text('Deleting account…'),
            ],
          ),
        ),
      ),
    );
  }
}
