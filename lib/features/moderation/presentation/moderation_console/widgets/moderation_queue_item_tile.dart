// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';

/// Represents a single moderation queue row.
class ModerationQueueItemTile extends StatelessWidget {
  const ModerationQueueItemTile({
    super.key,
    required this.item,
    required this.onTap,
  });

  final ModerationQueueItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  backgroundColor: theme.colorScheme.primary,
                  child: Icon(
                    item.type == ModerationItemType.appeal
                        ? Icons.how_to_vote
                        : Icons.flag_outlined,
                    color: Colors.white,
                  ),
                ),
                title: Text(
                  item.contentTitle?.isNotEmpty == true
                      ? item.contentTitle!
                      : item.contentPreview,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(
                  item.contentPreview,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: const Icon(Icons.chevron_right),
              ),
              const SizedBox(height: 8),
              Text(
                '${item.authorHandle ?? 'Unknown author'} · ${_relativeTime(item.createdAt)}',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  _buildChip(
                    context,
                    label: item.severity.name.toUpperCase(),
                    color: _severityColor(context, item.severity),
                  ),
                  _buildChip(
                    context,
                    label: _titleCase(item.queue),
                    color: Colors.grey.shade700,
                  ),
                  if (item.aiRiskBand != null)
                    _buildChip(
                      context,
                      label: item.aiRiskBand!,
                      color: Colors.redAccent.shade100,
                    ),
                  if (item.isEscalated)
                    _buildChip(
                      context,
                      label: 'Escalated',
                      color: Colors.amber.shade300,
                    ),
                  _buildChip(
                    context,
                    label: item.status,
                    color: Colors.blueGrey,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.flag_outlined, size: 16),
                  const SizedBox(width: 4),
                  Text('${item.reportCount} flags'),
                  const SizedBox(width: 16),
                  const Icon(Icons.how_to_vote_outlined, size: 16),
                  const SizedBox(width: 4),
                  Text('${item.communityVotes} community votes'),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _severityColor(BuildContext context, ModerationSeverityLevel severity) {
    return switch (severity) {
      ModerationSeverityLevel.high => Colors.redAccent,
      ModerationSeverityLevel.medium => Colors.orangeAccent,
      ModerationSeverityLevel.low => Colors.greenAccent,
      ModerationSeverityLevel.unknown => Theme.of(context).colorScheme.primary,
    };
  }

  Widget _buildChip(
    BuildContext context, {
    required String label,
    required Color color,
  }) {
    return Chip(
      label: Text(label),
      backgroundColor: color.withValues(alpha: 0.15),
      side: BorderSide(color: color.withValues(alpha: 0.4)),
    );
  }

  String _relativeTime(DateTime createdAt) {
    final difference = DateTime.now().difference(createdAt);
    if (difference < const Duration(minutes: 1)) {
      return 'Just now';
    } else if (difference < const Duration(hours: 1)) {
      return '${difference.inMinutes}m ago';
    } else if (difference < const Duration(days: 1)) {
      return '${difference.inHours}h ago';
    }
    return '${difference.inDays}d ago';
  }

  String _titleCase(String value) {
    return value
        .split(RegExp(r'[-_\s]+'))
        .map(
          (word) => word.isEmpty
              ? word
              : '${word[0].toUpperCase()}${word.substring(1)}',
        )
        .join(' ');
  }
}
