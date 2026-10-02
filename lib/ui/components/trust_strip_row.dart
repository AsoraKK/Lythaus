// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

class TrustStripRow extends StatelessWidget {
  const TrustStripRow({
    super.key,
    required this.summary,
    required this.onTap,
    this.compact = false,
    this.leading,
  });

  final FeedTrustSummary summary;
  final VoidCallback onTap;
  final bool compact;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    if (compact) {
      return _CompactTrustDetails(
        summary: summary,
        onTap: onTap,
        leading: leading,
      );
    }

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

    return Semantics(
      button: true,
      label: 'View content history',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(context.radius.sm),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ...chips,
              _StatusChip(status: summary.trustStatus),
            ],
          ),
        ),
      ),
    );
  }
}

class _CompactTrustDetails extends StatefulWidget {
  const _CompactTrustDetails({
    required this.summary,
    required this.onTap,
    this.leading,
  });

  final FeedTrustSummary summary;
  final VoidCallback onTap;
  final Widget? leading;

  @override
  State<_CompactTrustDetails> createState() => _CompactTrustDetailsState();
}

class _CompactTrustDetailsState extends State<_CompactTrustDetails> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final summary = widget.summary;
    final timeline = summary.timeline;
    final relevantStates = <Widget>[
      if (summary.trustStatus != 'no_extra_signals')
        _StatusChip(status: summary.trustStatus),
      if (timeline.created != 'complete')
        _TimelineChip(
          icon: Icons.fiber_manual_record_outlined,
          label: 'Created',
          state: timeline.created,
        ),
      if (timeline.mediaChecked != 'none' &&
          timeline.mediaChecked != 'complete')
        _TimelineChip(
          icon: Icons.perm_media_outlined,
          label: 'Media checked',
          state: timeline.mediaChecked,
        ),
      if (timeline.moderation != 'none')
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
      if (summary.hasAppeal &&
          timeline.appeal == null &&
          summary.trustStatus != 'under_appeal')
        Text('Appeal on record', style: context.textTheme.bodySmall),
    ];

    final detailsButton = MergeSemantics(
      child: Semantics(
        expanded: _expanded,
        child: TextButton.icon(
          onPressed: () => setState(() => _expanded = !_expanded),
          style: ButtonStyle(
            minimumSize: const WidgetStatePropertyAll(Size(48, 48)),
            padding: WidgetStatePropertyAll(
              EdgeInsets.symmetric(horizontal: context.spacing.sm),
            ),
            foregroundColor: WidgetStatePropertyAll(
              context.colorScheme.onSurfaceVariant,
            ),
            textStyle: WidgetStatePropertyAll(context.textTheme.bodySmall),
            animationDuration: Duration.zero,
            side: WidgetStateProperty.resolveWith(
              (states) => BorderSide(
                color: states.contains(WidgetState.focused)
                    ? context.colorScheme.primary
                    : Colors.transparent,
                width: 2,
              ),
            ),
          ),
          icon: Icon(_expanded ? Icons.expand_less : Icons.expand_more),
          label: const Text('Trust details'),
        ),
      ),
    );
    final leading = widget.leading;
    final stackDisclosure =
        MediaQuery.textScalerOf(context).scale(14) > 18 ||
        relevantStates.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (leading != null)
          if (stackDisclosure)
            leading
          else
            Row(
              children: [
                Expanded(child: leading),
                SizedBox(width: context.spacing.xs),
                detailsButton,
              ],
            ),
        if (relevantStates.isNotEmpty)
          Padding(
            padding: EdgeInsets.only(top: context.spacing.xs),
            child: Wrap(
              spacing: context.spacing.sm,
              runSpacing: context.spacing.sm,
              children: relevantStates,
            ),
          ),
        if (leading == null || stackDisclosure) detailsButton,
        if (_expanded)
          Padding(
            padding: EdgeInsets.only(bottom: context.spacing.sm),
            child: TrustStripRow(summary: summary, onTap: widget.onTap),
          ),
      ],
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
        borderRadius: BorderRadius.circular(context.radius.sm),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: colors.foreground),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              '$label: ${state.replaceAll('_', ' ')}',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: colors.foreground,
                fontWeight: FontWeight.w600,
              ),
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
      'no_extra_signals' => 'No extra signals',
      _ => status.replaceAll('_', ' '),
    };
    final colors = _colorsForState(context, status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(context.radius.sm),
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
