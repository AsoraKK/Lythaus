// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_card.dart';
import 'package:lythaus/features/moderation/application/moderation_providers.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';

/// LYTHAUS APPEAL HISTORY SCREEN
///
/// 🎯 Purpose: Personal dashboard for tracking user's appeal submissions
/// ✅ Features: Appeal timeline, status tracking, outcome history
/// 📊 Analytics: Success rates, response times, and patterns
/// 🔍 Filtering: By status, content type, and date range
/// 🏗️ Architecture: Presentation layer - Clean Architecture compliant

class AppealHistoryScreen extends ConsumerStatefulWidget {
  const AppealHistoryScreen({super.key});

  @override
  ConsumerState<AppealHistoryScreen> createState() =>
      _AppealHistoryScreenState();
}

class _AppealHistoryScreenState extends ConsumerState<AppealHistoryScreen>
    with TickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Appeals'),
        centerTitle: true,
        backgroundColor: Theme.of(context).colorScheme.surface,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(myAppealsProvider),
            tooltip: 'Refresh',
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'All', icon: Icon(Icons.list)),
            Tab(text: 'Active', icon: Icon(Icons.pending_actions)),
            Tab(text: 'Analytics', icon: Icon(Icons.analytics)),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildAllAppeals(),
          _buildActiveAppeals(),
          _buildAnalytics(),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showNewAppealDialog(),
        icon: const Icon(Icons.add),
        label: const Text('New Appeal'),
        backgroundColor: Theme.of(context).colorScheme.primary,
      ),
    );
  }

  Widget _buildAllAppeals() {
    final appealsAsyncValue = ref.watch(myAppealsProvider);

    return appealsAsyncValue.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) => _buildErrorState(error.toString()),
      data: (appeals) {
        if (appeals.isEmpty) {
          return _buildEmptyState();
        }

        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(myAppealsProvider),
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: appeals.length,
            itemBuilder: (context, index) {
              final appeal = appeals[index];
              return _buildAppealCard(appeal);
            },
          ),
        );
      },
    );
  }

  Widget _buildActiveAppeals() {
    final appealsAsyncValue = ref.watch(myAppealsProvider);

    return appealsAsyncValue.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) => _buildErrorState(error.toString()),
      data: (appeals) {
        final activeAppeals = appeals
            .where((appeal) => appeal.votingStatus == VotingStatus.active)
            .toList();

        if (activeAppeals.isEmpty) {
          return _buildEmptyState('No active appeals');
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: activeAppeals.length,
          itemBuilder: (context, index) {
            final appeal = activeAppeals[index];
            return _buildAppealCard(appeal, showProgress: true);
          },
        );
      },
    );
  }

  Widget _buildAnalytics() {
    final appealsAsyncValue = ref.watch(myAppealsProvider);

    return appealsAsyncValue.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) => _buildErrorState(error.toString()),
      data: (appeals) {
        if (appeals.isEmpty) {
          return _buildEmptyState('No data for analytics');
        }

        return SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildOverviewCards(appeals),
              const SizedBox(height: 24),
              _buildContentTypeBreakdown(appeals),
              const SizedBox(height: 24),
              _buildVotingStatusBreakdown(appeals),
            ],
          ),
        );
      },
    );
  }

  Widget _buildAppealCard(Appeal appeal, {bool showProgress = false}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header with status and date
            Row(
              children: [
                _buildStatusBadge(context, appeal.votingStatus),
                const Spacer(),
                Text(
                  _formatDate(appeal.submittedAt),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Content info
            Row(
              children: [
                Icon(
                  _getContentIcon(appeal.contentType),
                  size: 16,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Text(
                  appeal.contentType.toUpperCase(),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
                const SizedBox(width: 16),
                Container(
                  padding: EdgeInsets.symmetric(
                    horizontal: context.spacing.sm,
                    vertical: context.spacing.xs / 2,
                  ),
                  decoration: BoxDecoration(
                    color: _getUrgencyColor(
                      context,
                      appeal.urgencyScore,
                    ).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(context.radius.pill),
                    border: Border.all(
                      color: _getUrgencyColor(context, appeal.urgencyScore),
                    ),
                  ),
                  child: Text(
                    'Urgency: ${_getUrgencyLabel(appeal.urgencyScore)}',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: _getUrgencyColor(context, appeal.urgencyScore),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Content preview
            if (appeal.contentTitle != null) ...[
              Text(
                appeal.contentTitle!,
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 8),
            ],

            Text(
              appeal.contentPreview,
              style: Theme.of(context).textTheme.bodyMedium,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),

            const SizedBox(height: 12),

            // Appeal reason
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Appeal Type: ${appeal.appealType.replaceAll('_', ' ')}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    appeal.appealReason,
                    style: Theme.of(context).textTheme.bodyMedium,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),

            // Progress indicator for active appeals
            if (showProgress && appeal.votingProgress != null) ...[
              const SizedBox(height: 12),
              _buildProgressIndicator(appeal.votingProgress!),
            ],

            const SizedBox(height: 12),

            // Action buttons
            Row(
              children: [
                TextButton.icon(
                  onPressed: () => _showAppealDetails(appeal),
                  icon: const Icon(Icons.visibility),
                  label: const Text('View Details'),
                ),
                const Spacer(),
                if (appeal.votingStatus == VotingStatus.active)
                  Icon(
                    Icons.schedule,
                    size: 16,
                    color: Theme.of(context).colorScheme.primary,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(BuildContext context, VotingStatus status) {
    final scheme = context.colorScheme;
    Color color;
    IconData icon;
    String label;

    switch (status) {
      case VotingStatus.active:
        color = scheme.primary;
        icon = Icons.how_to_vote;
        label = 'Active Voting';
        break;
      case VotingStatus.quorumReached:
        color = scheme.tertiary;
        icon = Icons.check_circle;
        label = 'Quorum Reached';
        break;
      case VotingStatus.timeExpired:
        color = scheme.onSurface.withValues(alpha: 0.6);
        icon = Icons.access_time;
        label = 'Time Expired';
        break;
      case VotingStatus.resolved:
        color = scheme.secondary;
        icon = Icons.verified;
        label = 'Resolved';
        break;
    }

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: context.spacing.md,
        vertical: context.spacing.xs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(context.radius.pill),
        border: Border.all(color: color),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          SizedBox(width: context.spacing.xs),
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProgressIndicator(VotingProgress progress) {
    final approvalRate = progress.approvalRate;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              Icons.how_to_vote,
              size: 16,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 8),
            Text(
              'Community Voting Progress',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            const Spacer(),
            Text(
              '${progress.totalVotes} votes',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
        const SizedBox(height: 8),

        if (progress.totalVotes > 0) ...[
          LinearProgressIndicator(
            value: approvalRate / 100,
            backgroundColor: Theme.of(
              context,
            ).colorScheme.error.withValues(alpha: 0.2),
            valueColor: AlwaysStoppedAnimation<Color>(
              Theme.of(context).colorScheme.primary,
            ),
          ),
          SizedBox(height: context.spacing.xs),
          Row(
            children: [
              Text(
                '${progress.approveVotes} approve',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              Text(
                '${progress.rejectVotes} reject',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: Theme.of(context).colorScheme.error,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ] else ...[
          Text(
            'Waiting for community votes...',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
          ),
        ],

        if (progress.timeRemaining != null) ...[
          SizedBox(height: context.spacing.xs),
          Text(
            'Time remaining: ${progress.timeRemaining ?? '5m window'}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.outline,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildOverviewCards(List<Appeal> appeals) {
    final totalAppeals = appeals.length;
    final activeAppeals = appeals
        .where((a) => a.votingStatus == VotingStatus.active)
        .length;
    final resolvedAppeals = appeals
        .where((a) => a.votingStatus == VotingStatus.resolved)
        .length;
    final successRate = totalAppeals > 0
        ? (resolvedAppeals / totalAppeals * 100)
        : 0;

    return Row(
      children: [
        Expanded(
          child: _buildOverviewCard(
            'Total Appeals',
            totalAppeals.toString(),
            Icons.list,
            Colors.blue,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: _buildOverviewCard(
            'Resolution Rate',
            '${successRate.toStringAsFixed(1)}%',
            Icons.trending_up,
            Colors.green,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: _buildOverviewCard(
            'Active',
            activeAppeals.toString(),
            Icons.pending_actions,
            Colors.orange,
          ),
        ),
      ],
    );
  }

  Widget _buildOverviewCard(
    String title,
    String value,
    IconData icon,
    Color color,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(icon, size: 32, color: color),
            const SizedBox(height: 8),
            Text(
              value,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              title,
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContentTypeBreakdown(List<Appeal> appeals) {
    final contentTypes = <String, int>{};
    for (final appeal in appeals) {
      contentTypes[appeal.contentType] =
          (contentTypes[appeal.contentType] ?? 0) + 1;
    }

    return LythCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Appeals by Content Type',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          SizedBox(height: context.spacing.lg),
          ...contentTypes.entries.map(
            (entry) => Padding(
              padding: EdgeInsets.symmetric(vertical: context.spacing.xs),
              child: Row(
                children: [
                  Icon(
                    _getContentIcon(entry.key),
                    size: 16,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  SizedBox(width: context.spacing.sm),
                  Text(entry.key.toUpperCase()),
                  const Spacer(),
                  Text(
                    entry.value.toString(),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVotingStatusBreakdown(List<Appeal> appeals) {
    final statusCounts = <VotingStatus, int>{};
    for (final appeal in appeals) {
      statusCounts[appeal.votingStatus] =
          (statusCounts[appeal.votingStatus] ?? 0) + 1;
    }

    return LythCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Appeals by Status',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          SizedBox(height: context.spacing.lg),
          ...statusCounts.entries.map(
            (entry) => Padding(
              padding: EdgeInsets.symmetric(vertical: context.spacing.xs),
              child: Row(
                children: [
                  _buildStatusBadge(context, entry.key),
                  const Spacer(),
                  Text(
                    entry.value.toString(),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(String error) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.error_outline,
            size: 64,
            color: Theme.of(context).colorScheme.error,
          ),
          SizedBox(height: context.spacing.lg),
          Text(
            'Failed to load appeals',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          Text(
            error,
            style: Theme.of(context).textTheme.bodyMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: () => ref.invalidate(myAppealsProvider),
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState([String? message]) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.inbox_outlined,
            size: 64,
            color: Theme.of(context).colorScheme.outline,
          ),
          const SizedBox(height: 16),
          Text(
            message ?? 'No appeals yet',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          Text(
            'Your submitted appeals will appear here',
            style: Theme.of(context).textTheme.bodyMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: () => _showNewAppealDialog(),
            icon: const Icon(Icons.add),
            label: const Text('Submit First Appeal'),
          ),
        ],
      ),
    );
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

  Color _getUrgencyColor(BuildContext context, int urgency) {
    final scheme = context.colorScheme;
    if (urgency >= 80) return scheme.error;
    if (urgency >= 60) return scheme.primary;
    if (urgency >= 40) return scheme.tertiary;
    return scheme.onSurface.withValues(alpha: 0.6);
  }

  String _getUrgencyLabel(int urgency) {
    if (urgency >= 80) return 'Critical';
    if (urgency >= 60) return 'High';
    if (urgency >= 40) return 'Medium';
    return 'Low';
  }

  String _formatDate(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);

    if (difference.inDays > 7) {
      return '${dateTime.day}/${dateTime.month}/${dateTime.year}';
    } else if (difference.inDays > 0) {
      return '${difference.inDays} days ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours}h ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}m ago';
    } else {
      return 'Just now';
    }
  }

  void _showAppealDetails(Appeal appeal) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Appeal Details'),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Status: ${appeal.votingStatus.name}'),
              const SizedBox(height: 8),
              Text('Content Type: ${appeal.contentType}'),
              const SizedBox(height: 8),
              Text('Submitted: ${_formatDate(appeal.submittedAt)}'),
              const SizedBox(height: 16),
              Text(
                'Reason:',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
              ),
              Text(appeal.appealReason),
              if (appeal.userStatement.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  'Statement:',
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(appeal.userStatement),
              ],
            ],
          ),
        ),
        actions: [
          LythButton.tertiary(
            label: 'Close',
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }

  void _showNewAppealDialog() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Open a blocked post and tap Appeal to submit a new case.',
        ),
      ),
    );
  }
}
