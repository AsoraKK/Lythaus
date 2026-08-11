// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/reactions/application/reaction_providers.dart';
import 'package:lythaus/features/reactions/domain/reaction.dart';

// ─────────────────────────────────────────────────────────────────────────────
// ReactionBar
//
// Displays a row of reaction buttons for a piece of content.
// Positive reactions are shown first, negative/report in a secondary row
// (collapsed by default to reduce visual noise).
//
// Usage:
//   ReactionBar(
//     contentId: post.id,
//     authorUserId: post.authorId,
//     initialSummary: post.reactionSummary,
//   )
// ─────────────────────────────────────────────────────────────────────────────

class ReactionBar extends ConsumerStatefulWidget {
  /// The ID of the post / article being reacted to.
  final String contentId;

  /// Retained for source compatibility; reactions are now post-scoped.
  final String authorUserId;

  /// Optional initial reaction summary from the feed payload.
  final ReactionSummary? initialSummary;

  const ReactionBar({
    super.key,
    required this.contentId,
    required this.authorUserId,
    this.initialSummary,
  });

  @override
  ConsumerState<ReactionBar> createState() => _ReactionBarState();
}

class _ReactionBarState extends ConsumerState<ReactionBar> {
  // ── local state ────────────────────────────────────────────────────────────

  /// Optimistic counts: reactionType.apiValue → count
  late Map<String, int> _counts;

  /// Currently selected reaction for the local user (null = no reaction yet).
  String? _myReaction;

  /// Whether a submit is in flight.
  bool _submitting = false;

  static const _positiveTypes = ReactionType.values;

  @override
  void initState() {
    super.initState();
    final summary = widget.initialSummary;
    _counts = summary != null ? Map<String, int>.from(summary.counts) : {};
    _myReaction = summary?.myReactionType;
  }

  // ── actions ────────────────────────────────────────────────────────────────

  Future<void> _handleReaction(ReactionType type) async {
    if (_submitting) return;
    setState(() => _submitting = true);

    // Optimistic update
    final previous = _myReaction;
    setState(() {
      // Remove prior reaction count
      if (previous != null) {
        _counts[previous] = (_counts[previous] ?? 1) - 1;
      }
      // Toggle off if tapping the same reaction
      if (previous == type.apiValue) {
        _myReaction = null;
      } else {
        _counts[type.apiValue] = (_counts[type.apiValue] ?? 0) + 1;
        _myReaction = type.apiValue;
      }
    });

    try {
      final request = previous == type.apiValue
          ? ref.read(deleteReactionProvider(widget.contentId).future)
          : ref.read(
              submitReactionProvider(
                SubmitReactionRequest(
                  postId: widget.contentId,
                  reactionType: type.apiValue,
                ),
              ).future,
            );
      await request.timeout(const Duration(seconds: 10));
    } catch (_) {
      // Revert optimistic update on error
      setState(() {
        if (previous == type.apiValue) {
          _counts[type.apiValue] = (_counts[type.apiValue] ?? 0) + 1;
          _myReaction = previous;
        } else {
          _counts[type.apiValue] = (_counts[type.apiValue] ?? 1) - 1;
          if (previous != null) {
            _counts[previous] = (_counts[previous] ?? 0) + 1;
          }
          _myReaction = previous;
        }
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  int _countFor(ReactionType type) => _counts[type.apiValue] ?? 0;
  bool _isSelected(ReactionType type) => _myReaction == type.apiValue;

  // ── build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final selectedColor = colorScheme.primary;
    final defaultColor = colorScheme.onSurfaceVariant;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Positive reactions row ────────────────────────────────────────
        Wrap(
          spacing: 4,
          runSpacing: 4,
          children: [
            ..._positiveTypes.map(
              (type) => _ReactionChip(
                type: type,
                count: _countFor(type),
                selected: _isSelected(type),
                selectedColor: selectedColor,
                defaultColor: defaultColor,
                onTap: _submitting ? null : () => _handleReaction(type),
              ),
            ),
          ],
        ),

        // ── Negative reactions row (collapsible) ──────────────────────────
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// _ReactionChip — internal chip widget for a single reaction
// ─────────────────────────────────────────────────────────────────────────────

class _ReactionChip extends StatelessWidget {
  const _ReactionChip({
    required this.type,
    required this.count,
    required this.selected,
    required this.selectedColor,
    required this.defaultColor,
    this.onTap,
  });

  final ReactionType type;
  final int count;
  final bool selected;
  final Color selectedColor;
  final Color defaultColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? selectedColor : defaultColor;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? color.withAlpha(30) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? color : color.withAlpha(60),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_icon, style: const TextStyle(fontSize: 14)),
            const SizedBox(width: 4),
            Text(
              count > 0 ? '${type.label} $count' : type.label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String get _icon => type.name;
}
