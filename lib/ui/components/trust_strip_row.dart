// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/state/models/feed_models.dart';

class TrustStripRow extends StatelessWidget {
  const TrustStripRow({super.key, required this.summary, required this.onTap});

  final FeedTrustSummary summary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final timeline = summary.timeline;
    final chips = <Widget>[
      _TimelineChip(
        icon: Icons.fiber_manual_record_outlined,
        label: 'Created',
        state: timeline.created,
      ),
      _TimelineChip(
        icon: Icons.perm_media_outlined,
        label: 'Media checked',
        state: timeline.mediaChecked,
      ),
      _TimelineChip(
        icon: Icons.gavel_outlined,
        label: 'Moderation',
        state: timeline.moderation,
      ),
      if (timeline.appeal != null)
        _TimelineChip(
          icon: Icons.outbox_outlined,
          label: 'Appeal',
          state: timeline.appeal!,
        ),
    ];

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 4),
        child: Row(
          children: [
            Expanded(
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: chips),
              ),
            ),
            const SizedBox(width: 8),
            _StatusChip(status: summary.trustStatus),
          ],
        ),
      ),
    );
  }
}

class _TimelineChip extends StatelessWidget {
  const _TimelineChip({
    required this.icon,
    required this.label,
    required this.state,
  });

  final IconData icon;
  final String label;
  final String state;

  @override
  Widget build(BuildContext context) {
    final colors = _colorsForState(context, state);
    return Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: colors.foreground),
          const SizedBox(width: 4),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: colors.foreground,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final label = switch (status) {
      'under_appeal' => 'Under appeal',
      'actioned' => 'Actioned',
      'verified_signals_attached' => 'Verified signals attached',
      _ => 'No extra signals',
    };
    final colors = _colorsForState(context, status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: colors.border),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: colors.foreground,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _ChipColors {
  const _ChipColors({
    required this.background,
    required this.border,
    required this.foreground,
  });

  final Color background;
  final Color border;
  final Color foreground;
}

_ChipColors _colorsForState(BuildContext context, String state) {
  final scheme = Theme.of(context).colorScheme;
  switch (state) {
    case 'complete':
    case 'resolved':
    case 'verified_signals_attached':
      return _ChipColors(
        background: scheme.tertiaryContainer,
        border: scheme.tertiary.withValues(alpha: 0.5),
        foreground: scheme.onTertiaryContainer,
      );
    case 'warn':
    case 'open':
    case 'under_appeal':
      return _ChipColors(
        background: scheme.secondaryContainer,
        border: scheme.secondary.withValues(alpha: 0.5),
        foreground: scheme.onSecondaryContainer,
      );
    case 'actioned':
      return _ChipColors(
        background: scheme.errorContainer,
        border: scheme.error.withValues(alpha: 0.45),
        foreground: scheme.onErrorContainer,
      );
    default:
      return _ChipColors(
        background: scheme.surfaceContainerHighest,
        border: scheme.outlineVariant,
        foreground: scheme.onSurfaceVariant,
      );
  }
}
