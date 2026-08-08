// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/features/moderation/presentation/widgets/appeal_voting_card.dart'
    as moderation_widgets;

class AppealVotingCard extends ConsumerWidget {
  final Appeal appeal;
  final VoidCallback? onVoteSubmitted;
  final bool showFullContent;

  const AppealVotingCard({
    super.key,
    required this.appeal,
    this.onVoteSubmitted,
    this.showFullContent = false,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return moderation_widgets.AppealVotingCard(
      appeal: appeal,
      onVoteSubmitted: onVoteSubmitted,
      showFullContent: showFullContent,
    );
  }
}
