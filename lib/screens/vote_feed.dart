// ignore_for_file: public_member_api_docs, deprecated_member_use

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/moderation/application/moderation_providers.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart'
    show Appeal, VotingStatus;
import 'package:lythaus/widgets/appeal_voting_card.dart';

/// LYTHAUS VOTE FEED PAGE
///
/// 🎯 Purpose: Community voting dashboard for reviewing appealed content
/// ✅ Features: Real-time appeals, filtering, voting interface
/// 🗳️ Democracy: Community-driven content moderation
/// 📱 UX: Responsive Material 3 design with intuitive voting

class VoteFeedPage extends ConsumerStatefulWidget {
  const VoteFeedPage({super.key});

  @override
  ConsumerState<VoteFeedPage> createState() => _VoteFeedPageState();
}

class _VoteFeedPageState extends ConsumerState<VoteFeedPage> {
  List<Appeal> _appeals = [];
  bool _isLoading = true;
  String? _error;

  // Filter and search state
  String _searchQuery = '';
  String _statusFilter = 'all';
  String _contentTypeFilter = 'all';
  String _urgencyFilter = 'all';
  String _sortOrder = 'newest';

  // Controllers
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _loadAppeals();
    _searchController.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Community Voting'),
        centerTitle: true,
        backgroundColor: Theme.of(context).colorScheme.surface,
        elevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(120),
          child: Column(children: [_buildSearchBar(), _buildFilterChips()]),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadAppeals,
            tooltip: 'Refresh',
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.sort),
            tooltip: 'Sort',
            onSelected: (value) {
              setState(() {
                _sortOrder = value;
              });
              _applyFiltersAndSort();
            },
            itemBuilder: (context) => [
              const PopupMenuItem(value: 'newest', child: Text('Newest First')),
              const PopupMenuItem(value: 'oldest', child: Text('Oldest First')),
              const PopupMenuItem(value: 'urgency', child: Text('Most Urgent')),
              const PopupMenuItem(value: 'votes', child: Text('Most Voted')),
            ],
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: TextField(
        controller: _searchController,
        decoration: InputDecoration(
          hintText: 'Search appeals...',
          prefixIcon: const Icon(Icons.search),
          suffixIcon: _searchQuery.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: _clearSearch,
                )
              : null,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(24),
            borderSide: BorderSide.none,
          ),
          filled: true,
          fillColor: Theme.of(context).colorScheme.surfaceContainerHighest,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 8,
          ),
        ),
      ),
    );
  }

  Widget _buildFilterChips() {
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _buildFilterChip(
            'Status',
            _statusFilter == 'all' ? 'All Status' : _statusFilter,
            Icons.flag,
            () => _showStatusFilter(),
          ),
          const SizedBox(width: 8),
          _buildFilterChip(
            'Content',
            _contentTypeFilter == 'all' ? 'All Types' : _contentTypeFilter,
            Icons.category,
            () => _showContentTypeFilter(),
          ),
          const SizedBox(width: 8),
          _buildFilterChip(
            'Urgency',
            _urgencyFilter == 'all' ? 'All Urgency' : _urgencyFilter,
            Icons.priority_high,
            () => _showUrgencyFilter(),
          ),
          const SizedBox(width: 8),
          if (_hasActiveFilters())
            _buildFilterChip(
              'Clear',
              'Clear All',
              Icons.clear_all,
              _clearAllFilters,
              isAction: true,
            ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(
    String label,
    String value,
    IconData icon,
    VoidCallback onTap, {
    bool isAction = false,
  }) {
    final hasFilter = !value.startsWith('All') && !isAction;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: hasFilter || isAction
              ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.1)
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: hasFilter || isAction
                ? Theme.of(context).colorScheme.primary
                : Theme.of(context).colorScheme.outline.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 16,
              color: hasFilter || isAction
                  ? Theme.of(context).colorScheme.primary
                  : Theme.of(context).colorScheme.onSurface,
            ),
            const SizedBox(width: 6),
            Text(
              value,
              style: TextStyle(
                fontSize: 14,
                fontWeight: hasFilter || isAction
                    ? FontWeight.w600
                    : FontWeight.w500,
                color: hasFilter || isAction
                    ? Theme.of(context).colorScheme.primary
                    : Theme.of(context).colorScheme.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Loading appeals for community review...'),
          ],
        ),
      );
    }

    if (_error != null) {
      return _buildErrorState();
    }

    final filteredAppeals = _getFilteredAppeals();

    if (filteredAppeals.isEmpty) {
      return _buildEmptyState();
    }

    return RefreshIndicator(
      onRefresh: _loadAppeals,
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.all(16),
        itemCount: filteredAppeals.length,
        itemBuilder: (context, index) {
          final appeal = filteredAppeals[index];
          return Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: AppealVotingCard(
              appeal: appeal,
              onVoteSubmitted: _onVoteSubmitted,
            ),
          );
        },
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          Text(
            'Failed to load appeals',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          Text(
            _error ?? 'Unknown error',
            style: Theme.of(context).textTheme.bodyMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: _loadAppeals,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    final hasFilters = _hasActiveFilters() || _searchQuery.isNotEmpty;

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            hasFilters ? Icons.search_off : Icons.inbox_outlined,
            size: 64,
            color: Theme.of(context).colorScheme.outline,
          ),
          const SizedBox(height: 16),
          Text(
            hasFilters
                ? 'No appeals match your filters'
                : 'No appeals for voting',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          Text(
            hasFilters
                ? 'Try adjusting your search or filters'
                : 'All appeals have been reviewed or are not ready for voting',
            style: Theme.of(context).textTheme.bodyMedium,
            textAlign: TextAlign.center,
          ),
          if (hasFilters) ...[
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _clearAllFilters,
              icon: const Icon(Icons.clear_all),
              label: const Text('Clear Filters'),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _loadAppeals() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      const params = VotingFeedParams(
        page: 1,
        pageSize: 50, // Load more appeals for better UX
        filters: null, // Can be extended later
      );

      final appealResponse = await ref.read(votingFeedProvider(params).future);

      setState(() {
        _appeals = appealResponse.appeals;
        _isLoading = false;
      });
    } catch (error) {
      setState(() {
        _isLoading = false;
        _error = error.toString();
      });
    }
  }

  List<Appeal> _getFilteredAppeals() {
    final filtered = _appeals.where((appeal) {
      // Search filter
      if (_searchQuery.isNotEmpty) {
        final query = _searchQuery.toLowerCase();
        final matchesContent = appeal.contentPreview.toLowerCase().contains(
          query,
        );
        final matchesTitle =
            appeal.contentTitle?.toLowerCase().contains(query) ?? false;
        final matchesReason = appeal.appealReason.toLowerCase().contains(query);

        if (!matchesContent && !matchesTitle && !matchesReason) {
          return false;
        }
      }

      // Status filter
      if (_statusFilter != 'all') {
        switch (_statusFilter) {
          case 'active':
            if (appeal.votingStatus != VotingStatus.active) return false;
            break;
          case 'quorum':
            if (appeal.votingStatus != VotingStatus.quorumReached) return false;
            break;
          case 'expired':
            if (appeal.votingStatus != VotingStatus.timeExpired) return false;
            break;
        }
      }

      // Content type filter
      if (_contentTypeFilter != 'all') {
        if (appeal.contentType.toLowerCase() !=
            _contentTypeFilter.toLowerCase()) {
          return false;
        }
      }

      // Urgency filter
      if (_urgencyFilter != 'all') {
        switch (_urgencyFilter) {
          case 'high':
            if (appeal.urgencyScore < 70) return false;
            break;
          case 'medium':
            if (appeal.urgencyScore < 40 || appeal.urgencyScore >= 70) {
              return false;
            }
            break;
          case 'low':
            if (appeal.urgencyScore >= 40) return false;
            break;
        }
      }

      return true;
    }).toList();

    // Apply sorting
    switch (_sortOrder) {
      case 'newest':
        filtered.sort((a, b) => b.submittedAt.compareTo(a.submittedAt));
        break;
      case 'oldest':
        filtered.sort((a, b) => a.submittedAt.compareTo(b.submittedAt));
        break;
      case 'urgency':
        filtered.sort((a, b) => b.urgencyScore.compareTo(a.urgencyScore));
        break;
      case 'votes':
        filtered.sort((a, b) {
          final aVotes = a.votingProgress?.totalVotes ?? 0;
          final bVotes = b.votingProgress?.totalVotes ?? 0;
          return bVotes.compareTo(aVotes);
        });
        break;
    }

    return filtered;
  }

  void _onSearchChanged() {
    setState(() {
      _searchQuery = _searchController.text;
    });
  }

  void _clearSearch() {
    _searchController.clear();
    setState(() {
      _searchQuery = '';
    });
  }

  void _showStatusFilter() {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Filter by Status'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildFilterOption(
              'all',
              'All Status',
              groupValue: _statusFilter,
              onSelected: (value) => _statusFilter = value,
              dialogContext: dialogContext,
            ),
            _buildFilterOption(
              'active',
              'Active Voting',
              groupValue: _statusFilter,
              onSelected: (value) => _statusFilter = value,
              dialogContext: dialogContext,
            ),
            _buildFilterOption(
              'quorum',
              'Quorum Reached',
              groupValue: _statusFilter,
              onSelected: (value) => _statusFilter = value,
              dialogContext: dialogContext,
            ),
            _buildFilterOption(
              'expired',
              'Time Expired',
              groupValue: _statusFilter,
              onSelected: (value) => _statusFilter = value,
              dialogContext: dialogContext,
            ),
          ],
        ),
      ),
    );
  }

  void _showContentTypeFilter() {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Filter by Content Type'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildFilterOption(
              'all',
              'All Types',
              groupValue: _contentTypeFilter,
              onSelected: (value) => _contentTypeFilter = value,
              dialogContext: dialogContext,
            ),
            _buildFilterOption(
              'post',
              'Posts',
              groupValue: _contentTypeFilter,
              onSelected: (value) => _contentTypeFilter = value,
              dialogContext: dialogContext,
            ),
            _buildFilterOption(
              'comment',
              'Comments',
              groupValue: _contentTypeFilter,
              onSelected: (value) => _contentTypeFilter = value,
              dialogContext: dialogContext,
            ),
            _buildFilterOption(
              'user',
              'Users',
              groupValue: _contentTypeFilter,
              onSelected: (value) => _contentTypeFilter = value,
              dialogContext: dialogContext,
            ),
          ],
        ),
      ),
    );
  }

  void _showUrgencyFilter() {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Filter by Urgency'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildFilterOption(
              'all',
              'All Urgency',
              groupValue: _urgencyFilter,
              onSelected: (value) => _urgencyFilter = value,
              dialogContext: dialogContext,
            ),
            _buildFilterOption(
              'high',
              'High (70-100)',
              groupValue: _urgencyFilter,
              onSelected: (value) => _urgencyFilter = value,
              dialogContext: dialogContext,
            ),
            _buildFilterOption(
              'medium',
              'Medium (40-69)',
              groupValue: _urgencyFilter,
              onSelected: (value) => _urgencyFilter = value,
              dialogContext: dialogContext,
            ),
            _buildFilterOption(
              'low',
              'Low (0-39)',
              groupValue: _urgencyFilter,
              onSelected: (value) => _urgencyFilter = value,
              dialogContext: dialogContext,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterOption(
    String value,
    String label, {
    required String groupValue,
    required void Function(String value) onSelected,
    required BuildContext dialogContext,
  }) {
    return ListTile(
      title: Text(label),
      leading: Radio<String>(
        value: value,
        groupValue: groupValue,
        onChanged: (newValue) {
          if (newValue == null) return;
          setState(() {
            onSelected(newValue);
          });
          Navigator.of(dialogContext).pop();
          _applyFiltersAndSort();
        },
      ),
    );
  }

  void _applyFiltersAndSort() {
    setState(() {
      // Trigger rebuild with new filters
    });
  }

  bool _hasActiveFilters() {
    return _statusFilter != 'all' ||
        _contentTypeFilter != 'all' ||
        _urgencyFilter != 'all';
  }

  void _clearAllFilters() {
    setState(() {
      _statusFilter = 'all';
      _contentTypeFilter = 'all';
      _urgencyFilter = 'all';
      _searchQuery = '';
    });
    _searchController.clear();
  }

  void _onVoteSubmitted() {
    // Refresh the appeals list after a vote is submitted
    _loadAppeals();
  }
}
