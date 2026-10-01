// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

class AuthorshipDisclosure extends StatelessWidget {
  const AuthorshipDisclosure({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: EdgeInsets.symmetric(
      horizontal: context.spacing.sm,
      vertical: context.spacing.xs,
    ),
    decoration: BoxDecoration(
      border: Border(
        left: BorderSide(color: context.colorScheme.primary, width: 2),
      ),
    ),
    child: Text('Authorship: $label', style: context.textTheme.labelMedium),
  );
}
