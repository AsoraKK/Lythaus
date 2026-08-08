// ignore_for_file: public_member_api_docs

// ignore_for_file: use_build_context_synchronously

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_card.dart';
import 'package:lythaus/design_system/components/lyth_chip.dart';
import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/features/moderation/application/moderation_providers.dart';

/// LYTHAUS APPEAL VOTING CARD
///
/// 🎯 Purpose: Interactive card for community voting on appealed content
/// ✅ Features: Content preview, voting buttons, progress display
/// 🔐 Security: User eligibility validation and vote tracking
/// 📱 UX: Real-time feedback and responsive design
/// 🏗️ Architecture: Presentation layer widget - Clean Architecture compliant

class AppealVotingCard extends ConsumerStatefulWidget {
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
  ConsumerState<AppealVotingCard> createState() => _AppealVotingCardState();
}

class _AppealVotingCardState extends ConsumerState<AppealVotingCard> {
  bool _isVoting = false;
  String? _localUserVote;
  String? _pendingVote; // Tracks which vote is currently being submitted

  @override
  void initState() {
    super.initState();
    _localUserVote = widget.appeal.userVote;
  }

  @override
  Widget build(BuildContext context) {
    final spacing = context.spacing;

    return LythCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with urgency indicator
          _buildHeader(context),

          // Content preview
          Padding(
            padding: EdgeInsets.all(spacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Original content
                _buildContentSection(),

                SizedBox(height: spacing.lg),

                // Moderation info
                _buildModerationInfo(),

                SizedBox(height: spacing.lg),

                // Appeal reason
                _buildAppealSection(),

                SizedBox(height: spacing.lg),

                // Voting progress
                if (widget.appeal.votingProgress != null)
                  _buildVotingProgress(),

                SizedBox(height: spacing.lg),
              ],
            ),
          ),

          // Voting buttons
          _buildVotingButtons(),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final spacing = context.spacing;
    final urgencyColor = _getUrgencyColor(context, widget.appeal.urgencyScore);
    final headerColor = urgencyColor.withValues(alpha: 0.12);

    return ClipRRect(
      borderRadius: BorderRadius.only(
        topLeft: Radius.circular(context.radius.card),
        topRight: Radius.circular(context.radius.card),
      ),
      child: Container(
        padding: EdgeInsets.all(spacing.lg),
        color: headerColor,
        child: Row(
          children: [
            _buildUrgencyBadge(context, urgencyColor),
            SizedBox(width: spacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Appeal for ${widget.appeal.contentType}',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: urgencyColor,
                    ),
                  ),
                  Text(
                    'by ${widget.appeal.submitterName} • ${_formatTimeAgo(widget.appeal.submittedAt)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            if (widget.appeal.votingProgress != null)
              _buildTimeRemaining(context),
          ],
        ),
      ),
    );
  }

  Widget _buildUrgencyBadge(BuildContext context, Color urgencyColor) {
    final urgency = widget.appeal.urgencyScore;
    String label;

    if (urgency >= 80) {
      label = 'Critical';
    } else if (urgency >= 60) {
      label = 'High';
    } else if (urgency >= 40) {
      label = 'Medium';
    } else {
      label = 'Low';
    }

    final textColor = urgencyColor == context.colorScheme.error
        ? context.colorScheme.onError
        : context.colorScheme.onSurface;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: context.spacing.sm,
        vertical: context.spacing.xs,
      ),
      decoration: BoxDecoration(
        color: urgencyColor,
        borderRadius: BorderRadius.circular(context.radius.pill),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: textColor,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  Widget _buildTimeRemaining(BuildContext context) {
    final progress = widget.appeal.votingProgress;
    if (progress == null) return const SizedBox.shrink();
    final timeRemaining = progress.timeRemaining ?? '5m window';

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: context.spacing.sm,
        vertical: context.spacing.xs,
      ),
      decoration: BoxDecoration(
        color: context.colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(context.radius.sm),
        border: Border.all(color: context.colorScheme.outline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.access_time,
            size: 14,
            color: context.colorScheme.onSurface,
          ),
          SizedBox(width: context.spacing.xs),
          Text(
            timeRemaining,
            style: Theme.of(
              context,
            ).textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  Widget _buildContentSection() {
    final spacing = context.spacing;
    return Container(
      padding: EdgeInsets.all(spacing.md),
      decoration: BoxDecoration(
        color: context.colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(context.radius.md),
        border: Border.all(
          color: context.colorScheme.outline.withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                _getContentIcon(widget.appeal.contentType),
                size: 16,
                color: context.colorScheme.primary,
              ),
              SizedBox(width: spacing.sm),
              Text(
                'Original ${widget.appeal.contentType}',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
              ),
            ],
          ),
          SizedBox(height: spacing.sm),
          if (widget.appeal.contentTitle != null) ...[
            Text(
              widget.appeal.contentTitle!,
              style: Theme.of(
                context,
              ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
              maxLines: widget.showFullContent ? null : 2,
              overflow: widget.showFullContent ? null : TextOverflow.ellipsis,
            ),
            SizedBox(height: spacing.sm),
          ],
          Text(
            widget.appeal.contentPreview,
            style: Theme.of(context).textTheme.bodyMedium,
            maxLines: widget.showFullContent ? null : 3,
            overflow: widget.showFullContent ? null : TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildModerationInfo() {
    final spacing = context.spacing;
    final scheme = context.colorScheme;
    final aiLabel = widget.appeal.authorshipLabel;

    return Container(
      padding: EdgeInsets.all(spacing.md),
      decoration: BoxDecoration(
        color: scheme.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(context.radius.md),
        border: Border.all(color: scheme.error.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.flag, size: 16, color: scheme.error),
              SizedBox(width: spacing.sm),
              Text(
                'Flagged for: ${widget.appeal.flagReason}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: scheme.error,
                ),
              ),
            ],
          ),
          if (aiLabel.isNotEmpty) ...[
            SizedBox(height: spacing.sm),
            LythChip(
              label: aiLabel,
              icon: Icons.psychology,
              backgroundColor: scheme.surfaceContainerHigh,
            ),
          ],
          if (widget.appeal.flagCategories.isNotEmpty) ...[
            SizedBox(height: spacing.sm),
            Wrap(
              spacing: 8,
              children: widget.appeal.flagCategories.map((category) {
                return LythChip(
                  label: category,
                  backgroundColor: scheme.surfaceContainerHigh,
                );
              }).toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAppealSection() {
    final spacing = context.spacing;
    final scheme = context.colorScheme;
    return Container(
      padding: EdgeInsets.all(spacing.md),
      decoration: BoxDecoration(
        color: scheme.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(context.radius.md),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.gavel, size: 16, color: scheme.primary),
              SizedBox(width: spacing.sm),
              Text(
                'Appeal: ${widget.appeal.appealType.replaceAll('_', ' ').toUpperCase()}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: scheme.primary,
                ),
              ),
            ],
          ),
          SizedBox(height: spacing.sm),
          Text(
            widget.appeal.appealReason,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          if (widget.appeal.userStatement.isNotEmpty) ...[
            SizedBox(height: spacing.sm),
            Text(
              '"${widget.appeal.userStatement}"',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(fontStyle: FontStyle.italic),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildVotingProgress() {
    final progress = widget.appeal.votingProgress!;
    final approvalRate = progress.approvalRate;
    final spacing = context.spacing;
    final scheme = context.colorScheme;

    return Container(
      padding: EdgeInsets.all(spacing.md),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(context.radius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.how_to_vote, size: 16, color: scheme.primary),
              SizedBox(width: spacing.sm),
              Text(
                'Community Voting',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              Text(
                '${progress.totalVotes} votes',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
          SizedBox(height: spacing.md),
          if (progress.totalVotes > 0) ...[
            LinearProgressIndicator(
              value: approvalRate / 100,
              backgroundColor: scheme.error.withValues(alpha: 0.2),
              valueColor: AlwaysStoppedAnimation<Color>(scheme.primary),
            ),
            SizedBox(height: spacing.sm),
            Row(
              children: [
                Text(
                  '${progress.approveVotes} approve',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: scheme.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Spacer(),
                Text(
                  '${progress.rejectVotes} reject',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: scheme.error,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ] else ...[
            Text(
              'Be the first to vote on this appeal',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
            ),
          ],
          if (progress.quorumMet) ...[
            SizedBox(height: spacing.sm),
            LythChip(
              label: 'Quorum reached',
              icon: Icons.check_circle,
              backgroundColor: scheme.surfaceContainerHigh,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildVotingButtons() {
    // Check if user has already voted
    if (_localUserVote != null) {
      return _buildVotedState();
    }

    // Check if user can vote
    if (!widget.appeal.canUserVote) {
      return _buildIneligibleState();
    }

    // Show voting buttons
    return _buildActiveVotingButtons();
  }

  Widget _buildVotedState() {
    final isApprove = _localUserVote == 'approve';
    final scheme = context.colorScheme;
    final spacing = context.spacing;
    final accentColor = isApprove ? scheme.primary : scheme.error;

    return Container(
      padding: EdgeInsets.all(spacing.md),
      decoration: BoxDecoration(
        color: accentColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(context.radius.md),
        border: Border.all(color: accentColor.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(
            isApprove ? Icons.thumb_up : Icons.thumb_down,
            color: accentColor,
            size: 20,
          ),
          SizedBox(width: spacing.sm),
          Text(
            'You voted to ${isApprove ? 'approve' : 'reject'} this appeal',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: accentColor,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildIneligibleState() {
    final scheme = context.colorScheme;
    final spacing = context.spacing;
    return Container(
      padding: EdgeInsets.all(spacing.md),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(context.radius.md),
        border: Border.all(color: scheme.outline.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(Icons.block, color: scheme.onSurface, size: 20),
          SizedBox(width: spacing.sm),
          Expanded(
            child: Text(
              widget.appeal.voteIneligibilityReason ??
                  'You cannot vote on this appeal',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: scheme.onSurface,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveVotingButtons() {
    final spacing = context.spacing;

    return Container(
      padding: EdgeInsets.fromLTRB(
        spacing.lg,
        spacing.md,
        spacing.lg,
        spacing.lg,
      ),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: context.colorScheme.outline.withValues(alpha: 0.3),
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: LythButton.primary(
              label: 'Approve',
              icon: Icons.thumb_up,
              onPressed: _isVoting ? null : () => _submitVote('approve'),
              isLoading: _isVoting && _pendingVote == 'approve',
            ),
          ),
          SizedBox(width: spacing.md),
          Expanded(
            child: LythButton.destructive(
              label: 'Reject',
              icon: Icons.thumb_down,
              onPressed: _isVoting ? null : () => _submitVote('reject'),
              isLoading: _isVoting && _pendingVote == 'reject',
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _submitVote(String vote) async {
    setState(() {
      _isVoting = true;
      _pendingVote = vote;
    });

    try {
      final submission = VoteSubmission(
        appealId: widget.appeal.appealId,
        vote: vote,
      );

      final result = await ref.read(submitVoteProvider(submission).future);

      if (result.success) {
        setState(() {
          _localUserVote = vote;
        });

        if (mounted) {
          LythSnackbar.success(
            context: context,
            message: 'Vote submitted successfully!',
          );
        }

        widget.onVoteSubmitted?.call();
      } else {
        throw Exception(result.message ?? 'Failed to submit vote');
      }
    } catch (error) {
      if (mounted) {
        if (error is ModerationException) {
          final handled = await showDeviceIntegrityBlockedForCode(
            context,
            code: error.code,
          );
          if (handled) {
            return;
          }

          if (error.statusCode == 429) {
            LythSnackbar.error(
              context: context,
              message: 'Too many votes. Please wait before trying again.',
            );
            return;
          }

          if (error.message.isNotEmpty) {
            LythSnackbar.error(context: context, message: error.message);
            return;
          }
        }
        LythSnackbar.error(
          context: context,
          message: 'Failed to submit vote: $error',
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isVoting = false;
          _pendingVote = null;
        });
      }
    }
  }

  Color _getUrgencyColor(BuildContext context, int urgency) {
    final scheme = context.colorScheme;
    if (urgency >= 80) return scheme.error;
    if (urgency >= 60) return scheme.primary;
    if (urgency >= 40) return scheme.tertiary;
    return scheme.onSurface.withValues(alpha: 0.6);
  }

  IconData _getContentIcon(String contentType) {
    switch (contentType.toLowerCase()) {
      case 'post':
        return Icons.article;
      case 'comment':
        return Icons.comment;
      case 'user':
        return Icons.person;
      default:
        return Icons.content_copy;
    }
  }

  String _formatTimeAgo(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);

    if (difference.inDays > 0) {
      return '${difference.inDays}d ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours}h ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}m ago';
    } else {
      return 'Just now';
    }
  }
}
