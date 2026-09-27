// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

class ReadingPane extends StatelessWidget {
  const ReadingPane({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Theme.of(context).scaffoldBackgroundColor,
    child: Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: SizedBox(
          width: double.infinity,
          height: double.infinity,
          child: child,
        ),
      ),
    ),
  );
}
