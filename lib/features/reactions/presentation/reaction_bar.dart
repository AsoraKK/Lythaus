// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/feed/application/feed_actions_service.dart';
import 'package:lythaus/features/feed/application/feed_read_session.dart';

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
    if (_submitting ||
        ref.read(pendingFeedActionsProvider).containsKey(widget.contentId)) {
      return;
    }
    final session = ref.read(feedReadSessionProvider);
    final useful = ref.read(confirmedUsefulProvider.notifier);
    final pending = ref.read(pendingFeedActionsProvider.notifier);
    final postId = widget.contentId;
    final service = ref.read(feedActionsServiceProvider);
    pending.state = {...pending.state, postId: 'useful:busy'};
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
      final token = await session.readToken();
      session.requireCurrent();
      await service
          .reaction(
            postId,
            previous == type.apiValue ? null : type.apiValue,
            token!,
          )
          .timeout(const Duration(seconds: 10));
      if (session.isCurrent) {
        useful.state = {
          ...useful.state,
          postId: previous != type.apiValue && type.apiValue == 'insightful',
        };
        pending.state = {...pending.state}..remove(postId);
      }
    } catch (error) {
      if (session.isCurrent) {
        final status = error is DioException
            ? error.response?.statusCode
            : null;
        final denied =
            status != null && status >= 400 && status < 500 && status != 409;
        pending.state = denied
            ? ({...pending.state}..remove(postId))
            : {...pending.state, postId: 'useful'};
      }
      if (!mounted) return;
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
    final blocked = ref
        .watch(pendingFeedActionsProvider)
        .containsKey(widget.contentId);

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
                onTap: _submitting || blocked
                    ? null
                    : () => _handleReaction(type),
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
    return Semantics(
      selected: selected,
      child: OutlinedButton.icon(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          foregroundColor: color,
          backgroundColor: selected
              ? Theme.of(context).colorScheme.primaryContainer
              : null,
          side: BorderSide(
            color: selected ? color : Theme.of(context).colorScheme.outline,
          ),
        ),
        icon: Icon(switch (type) {
          ReactionType.like => Icons.thumb_up_outlined,
          ReactionType.insightful => Icons.lightbulb_outline,
          ReactionType.support => Icons.favorite_border,
        }, size: 18),
        label: Text(count > 0 ? '${type.label} $count' : type.label),
      ),
    );
  }
}
