// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

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
    final colors = context.semanticColors;
    return Card(
      elevation: 0,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(context.radius.card),
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
                        ? Icons.groups_outlined
                        : Icons.flag_outlined,
                    color: theme.colorScheme.onPrimary,
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
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  if (item.aiRiskBand != null)
                    _buildChip(
                      context,
                      label: item.aiRiskBand!,
                      color: colors['warning']!,
                    ),
                  if (item.isEscalated)
                    _buildChip(
                      context,
                      label: 'Escalated',
                      color: colors['warning']!,
                    ),
                  _buildChip(
                    context,
                    label: item.status,
                    color: colors['info']!,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: context.spacing.lg,
                runSpacing: context.spacing.sm,
                children: [
                  Text('${item.reportCount} flags'),
                  Text('${item.reviewerDecisions} assigned reviewer decisions'),
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
      ModerationSeverityLevel.high => context.semanticColors['danger']!,
      ModerationSeverityLevel.medium => context.semanticColors['warning']!,
      ModerationSeverityLevel.low => context.semanticColors['info']!,
      ModerationSeverityLevel.unknown => Theme.of(context).colorScheme.primary,
    };
  }

  Widget _buildChip(
    BuildContext context, {
    required String label,
    required Color color,
  }) {
    return Chip(
      label: Text(label, style: TextStyle(color: color)),
      backgroundColor: Theme.of(context).colorScheme.surface,
      side: BorderSide(color: Theme.of(context).colorScheme.outline),
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
