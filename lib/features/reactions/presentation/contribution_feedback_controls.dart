// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/feed_read_session.dart';
import 'package:lythaus/features/reactions/application/contribution_feedback_controller.dart';
import 'package:lythaus/features/reactions/domain/contribution_feedback.dart';

class ContributionFeedbackControls extends ConsumerStatefulWidget {
  const ContributionFeedbackControls({
    super.key,
    required this.target,
    required this.authorId,
    this.trailingActions,
  });
  final FeedbackTarget target;
  final String authorId;
  final Widget? trailingActions;

  @override
  ConsumerState<ContributionFeedbackControls> createState() =>
      _ContributionFeedbackControlsState();
}

class _ContributionFeedbackControlsState
    extends ConsumerState<ContributionFeedbackControls> {
  bool _expanded = false;
  static const _emotions = <ContentEmotion, (String, String)>{
    ContentEmotion.amused: ('😄', 'Amused'),
    ContentEmotion.sad: ('😢', 'Sad'),
    ContentEmotion.angry: ('😠', 'Angry'),
    ContentEmotion.surprised: ('😮', 'Surprised'),
    ContentEmotion.appreciative: ('🙏', 'Appreciative'),
  };

  @override
  Widget build(BuildContext context) {
    final feedback = ref.watch(contributionFeedbackProvider(widget.target));
    final controller = ref.read(
      contributionFeedbackProvider(widget.target).notifier,
    );
    final session = ref.watch(feedReadSessionProvider);
    final summary = feedback.summary;
    final enabled =
        session.isAuthenticated &&
        !feedback.loading &&
        !feedback.busy &&
        feedback.recoveryChannel == null &&
        summary != null;
    final total =
        summary?.emotionCounts.values.fold<int>(0, (a, b) => a + b) ?? 0;
    final currentUser = ref.watch(currentUserProvider)?.id;
    final canVote = enabled && currentUser != widget.authorId;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Semantics(
                expanded: _expanded,
                child: TextButton.icon(
                  style: TextButton.styleFrom(
                    alignment: Alignment.centerLeft,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 8,
                    ),
                    foregroundColor: Theme.of(context).colorScheme.onSurface,
                  ),
                  onPressed: () => setState(() => _expanded = !_expanded),
                  icon: const Icon(Icons.add_reaction_outlined, size: 20),
                  label: Text(
                    'React to content${summary == null ? '' : ' · $total'}',
                  ),
                ),
              ),
            ),
            IconButton(
              tooltip: 'About quality feedback',
              onPressed: () => showDialog<void>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('About quality feedback'),
                  content: const Text(
                    'Rate the author’s quality of work, not whether you agree with the conclusion. Reactions express how the content makes you feel.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Close'),
                    ),
                  ],
                ),
              ),
              icon: const Icon(Icons.info_outline, size: 20),
            ),
          ],
        ),
        if (_expanded)
          Wrap(
            spacing: 4,
            children: [
              for (final entry in _emotions.entries)
                Semantics(
                  selected: summary?.myEmotion == entry.key,
                  child: TextButton(
                    style: TextButton.styleFrom(
                      minimumSize: const Size(48, 48),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 8,
                      ),
                      backgroundColor: summary?.myEmotion == entry.key
                          ? Theme.of(context).colorScheme.primaryContainer
                          : null,
                    ),
                    onPressed: !canVote
                        ? null
                        : () => controller.change(
                            FeedbackChannel.emotion,
                            summary.myEmotion == entry.key
                                ? null
                                : entry.key.name,
                          ),
                    child: Semantics(
                      label:
                          '${entry.value.$2}, ${summary?.emotionCounts[entry.key] ?? 0} reactions',
                      child: ExcludeSemantics(
                        child: Text(
                          '${entry.value.$1} ${summary?.emotionCounts[entry.key] ?? 0}',
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        LayoutBuilder(
          builder: (context, constraints) {
            final quality = Wrap(
              spacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                for (final vote in QualityVote.values)
                  Semantics(
                    selected: summary?.myQuality == vote,
                    child: TextButton.icon(
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 8,
                        ),
                        foregroundColor: summary?.myQuality == vote
                            ? Theme.of(context).colorScheme.primary
                            : Theme.of(context).colorScheme.onSurface,
                      ),
                      onPressed: !canVote
                          ? null
                          : () => controller.change(
                              FeedbackChannel.quality,
                              summary.myQuality == vote ? null : vote.name,
                            ),
                      icon: Icon(
                        vote == QualityVote.like
                            ? summary?.myQuality == vote
                                  ? Icons.thumb_up
                                  : Icons.thumb_up_outlined
                            : summary?.myQuality == vote
                            ? Icons.thumb_down
                            : Icons.thumb_down_outlined,
                        size: 20,
                      ),
                      label: Text(
                        '${vote == QualityVote.like ? 'Like' : 'Dislike'}${summary == null ? '' : ' ${summary.qualityCounts[vote]}'}',
                      ),
                    ),
                  ),
              ],
            );
            if (widget.trailingActions == null) return quality;
            final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
            if (constraints.maxWidth >= 212 * scale + 96) {
              return Row(
                children: [
                  Expanded(child: quality),
                  widget.trailingActions!,
                ],
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: widget.trailingActions!,
                ),
                quality,
              ],
            );
          },
        ),
        if (feedback.loading || feedback.busy)
          const LinearProgressIndicator(semanticsLabel: 'Loading feedback'),
        if (feedback.error != null)
          Semantics(liveRegion: true, child: Text(feedback.error!)),
        if (feedback.error != null)
          TextButton(
            onPressed: feedback.loading ? null : controller.refresh,
            child: const Text('Check current state'),
          ),
        if (feedback.recoveryChannel != null && !feedback.needsReentry)
          TextButton(
            onPressed: feedback.busy ? null : controller.retrySaved,
            child: const Text('Retry saved change'),
          ),
        if (feedback.recoveryChannel != null && feedback.needsReentry) ...[
          Text(
            'Select the previous ${feedback.recoveryChannel!.name} choice to check the same change.',
          ),
          Wrap(
            children: [
              if (feedback.recoveryChannel == FeedbackChannel.quality)
                for (final vote in QualityVote.values)
                  TextButton(
                    onPressed: feedback.busy
                        ? null
                        : () => controller.change(
                            FeedbackChannel.quality,
                            vote.name,
                          ),
                    child: Text(vote == QualityVote.like ? 'Like' : 'Dislike'),
                  )
              else
                for (final emotion in ContentEmotion.values)
                  TextButton(
                    onPressed: feedback.busy
                        ? null
                        : () => controller.change(
                            FeedbackChannel.emotion,
                            emotion.name,
                          ),
                    child: Text(_emotions[emotion]!.$2),
                  ),
              TextButton(
                onPressed: feedback.busy
                    ? null
                    : () => controller.change(feedback.recoveryChannel!, null),
                child: const Text('Remove previous choice'),
              ),
            ],
          ),
        ],
        if (!session.isAuthenticated && summary != null)
          const Text('Sign in to rate or react.'),
      ],
    );
  }
}
