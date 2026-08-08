// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';

class ModerationAuditTimeline extends StatelessWidget {
  const ModerationAuditTimeline({super.key, required this.entries});

  final List<ModerationAuditEntry> entries;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return const Text('No audit history available.');
    }
    return ListView.separated(
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      itemCount: entries.length,
      separatorBuilder: (_, __) => const Divider(),
      itemBuilder: (context, index) {
        final entry = entries[index];
        return ListTile(
          leading: CircleAvatar(
            backgroundColor: Theme.of(
              context,
            ).colorScheme.primary.withValues(alpha: 0.2),
            child: Icon(
              _iconForAction(entry.action),
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
          title: Text('${_actionLabel(entry.action)} • ${entry.actorId}'),
          subtitle: Text(entry.details),
          trailing: Text(
            _relativeTime(entry.timestamp),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        );
      },
    );
  }

  IconData _iconForAction(ModerationAuditActionType action) {
    return switch (action) {
      ModerationAuditActionType.flagged => Icons.flag,
      ModerationAuditActionType.aiEvaluated => Icons.memory,
      ModerationAuditActionType.communityVote => Icons.how_to_vote,
      ModerationAuditActionType.decision => Icons.rule,
      ModerationAuditActionType.escalation => Icons.arrow_upward,
      ModerationAuditActionType.appeal => Icons.chat,
    };
  }

  String _actionLabel(ModerationAuditActionType action) {
    return switch (action) {
      ModerationAuditActionType.flagged => 'Flagged',
      ModerationAuditActionType.aiEvaluated => 'AI signal',
      ModerationAuditActionType.communityVote => 'Community vote',
      ModerationAuditActionType.decision => 'Moderator decision',
      ModerationAuditActionType.escalation => 'Escalated',
      ModerationAuditActionType.appeal => 'Appeal',
    };
  }

  String _relativeTime(DateTime timestamp) {
    final diff = DateTime.now().difference(timestamp);
    if (diff < const Duration(minutes: 1)) return 'Just now';
    if (diff < const Duration(hours: 1)) return '${diff.inMinutes}m ago';
    if (diff < const Duration(days: 1)) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}
