// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_card.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/widgets/appeal_sheet.dart';

class BlockedPostCard extends StatelessWidget {
  final String postId;
  const BlockedPostCard({super.key, required this.postId});

  @override
  Widget build(BuildContext context) {
    return LythCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'This post was blocked',
            style: Theme.of(
              context,
            ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          SizedBox(height: context.spacing.sm),
          LythButton.primary(
            label: 'Appeal decision',
            onPressed: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              builder: (_) => AppealSheet(postId: postId),
            ),
          ),
        ],
      ),
    );
  }
}
