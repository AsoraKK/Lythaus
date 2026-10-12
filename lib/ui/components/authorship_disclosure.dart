// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

class AuthorshipDisclosure extends StatelessWidget {
  const AuthorshipDisclosure({
    super.key,
    required this.label,
    this.classificationSource = 'user_disclosure',
    this.classificationState = 'unavailable',
  });

  final String label;
  final String classificationSource;
  final String classificationState;

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
    child: Text(
      (label == 'Human-authored' || label == 'AI-assisted') &&
              (classificationSource == 'user_disclosure' ||
                  (classificationSource == 'automated_classification' &&
                      classificationState == 'confirmed'))
          ? '${classificationSource == 'user_disclosure' ? 'Author declaration' : 'Authorship assessment'}: $label'
          : 'Authorship: Under review',
      style: context.textTheme.labelMedium,
    ),
  );
}
