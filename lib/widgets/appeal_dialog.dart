// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/features/moderation/domain/appeal.dart';

/// Explains the case-gated appeal process without attempting to submit an
/// appeal from a content identifier alone.
class AppealDialog extends StatelessWidget {
  const AppealDialog({
    super.key,
    required this.contentId,
    required this.contentType,
    this.contentPreview,
    required this.currentStatus,
  });

  final String contentId;
  final String contentType;
  final String? contentPreview;
  final ModerationStatus currentStatus;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Appeal information'),
      content: Semantics(
        liveRegion: true,
        label: 'Appeal information for $contentType content',
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _StatusNotice(status: currentStatus),
              if (contentPreview != null && contentPreview!.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  contentPreview!,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              const SizedBox(height: 16),
              const Text(
                'Appeals can be submitted only from an eligible resolved '
                'moderation case. This content view does not have the case '
                'record needed to start one.',
              ),
              const SizedBox(height: 12),
              const Text(
                'Each eligible appeal is reviewed by five independently '
                'assigned trained reviewers and a trained adjudicator. '
                'Reviewer decisions alone do not change content state.',
              ),
              const SizedBox(height: 12),
              Text(
                'Open account activity to see whether an appeal is available '
                'for this case.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Close'),
        ),
      ],
    );
  }
}

class _StatusNotice extends StatelessWidget {
  const _StatusNotice({required this.status});

  final ModerationStatus status;

  @override
  Widget build(BuildContext context) {
    final (text, color, icon) = switch (status) {
      ModerationStatus.flagged => (
        'This content has been reported and remains visible.',
        Colors.orange,
        Icons.flag_outlined,
      ),
      ModerationStatus.hidden => (
        'This content is currently blocked by moderation.',
        Colors.red,
        Icons.visibility_off,
      ),
      ModerationStatus.appealUpheld => (
        'This appeal was resolved and the content remains blocked.',
        Colors.red,
        Icons.cancel_outlined,
      ),
      ModerationStatus.appealRestored => (
        'This appeal was resolved and the content was restored.',
        Colors.green,
        Icons.check_circle_outline,
      ),
      ModerationStatus.clean => (
        'This content is not currently blocked by moderation.',
        Colors.blue,
        Icons.info_outline,
      ),
    };

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: color, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}

Future<bool?> showAppealDialog({
  required BuildContext context,
  required String contentId,
  required String contentType,
  String? contentPreview,
  required ModerationStatus currentStatus,
}) {
  return showDialog<bool>(
    context: context,
    builder: (context) => AppealDialog(
      contentId: contentId,
      contentType: contentType,
      contentPreview: contentPreview,
      currentStatus: currentStatus,
    ),
  );
}
