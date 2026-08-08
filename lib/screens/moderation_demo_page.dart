// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/widgets/post_card.dart';

/// LYTHAUS MODERATION DEMO PAGE
///
/// 🎯 Purpose: Demonstrate all Phase 5 moderation features
/// ✅ Features: Flag reporting, moderation badges, appeal system
/// 🎨 Design: Feed layout with various post states
/// 📱 UX: Interactive examples of moderation workflow

class ModerationDemoPage extends ConsumerStatefulWidget {
  const ModerationDemoPage({super.key});

  @override
  ConsumerState<ModerationDemoPage> createState() => _ModerationDemoPageState();
}

class _ModerationDemoPageState extends ConsumerState<ModerationDemoPage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Moderation Demo'),
        actions: [
          PopupMenuButton<String>(
            onSelected: _handleMenuSelection,
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'appeals',
                child: ListTile(
                  leading: Icon(Icons.gavel),
                  title: Text('My Appeals'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'voting',
                child: ListTile(
                  leading: Icon(Icons.how_to_vote),
                  title: Text('Community Voting'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'settings',
                child: ListTile(
                  leading: Icon(Icons.settings),
                  title: Text('Moderation Settings'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
        ],
      ),
      body: ListView(
        children: [
          // Demo info header
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.science,
                      color: Theme.of(context).colorScheme.onPrimaryContainer,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Phase 5: Moderation Demo',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onPrimaryContainer,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'This demo showcases the complete moderation system:\n'
                  '• Flag/Report posts with detailed reasons\n'
                  '• View moderation status and appeal flow\n'
                  '• Appeal flagged content with democratic voting\n'
                  '• Track appeal progress and outcomes',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onPrimaryContainer,
                  ),
                ),
              ],
            ),
          ),

          // Clean post (no moderation issues)
          PostCard(
            post: _createSamplePost(
              id: 'post1',
              title: 'Welcome to the Community!',
              content:
                  'This is a clean post with no moderation issues. You can interact with it normally - like, comment, share, or report if needed.',
              author: const Author(
                id: 'user1',
                displayName: 'Alice Johnson',
                avatarUrl: null,
              ),
              moderationStatus: ModerationStatus.clean,
            ),
          ),

          // Flagged post (not hidden yet)
          PostCard(
            post: _createSamplePost(
              id: 'post2',
              title: 'Controversial Opinion',
              content:
                  'This post has been flagged by community members but is still visible. The moderation team is reviewing it.',
              author: const Author(
                id: 'user2',
                displayName: 'Bob Smith',
                avatarUrl: null,
              ),
              moderationStatus: ModerationStatus.flagged,
            ),
          ),

          // Own flagged post (can appeal)
          PostCard(
            post: _createSamplePost(
              id: 'post3',
              title: 'My Flagged Post',
              content:
                  'This is your own post that has been flagged. You can see the moderation banner and appeal the decision if you believe it was made in error.',
              author: const Author(
                id: 'currentUser',
                displayName: 'You',
                avatarUrl: null,
              ),
              moderationStatus: ModerationStatus.flagged,
            ),
            isOwnPost: true,
          ),

          // Hidden post (own content)
          PostCard(
            post: _createSamplePost(
              id: 'post4',
              title: 'Hidden Content',
              content:
                  'This post has been hidden by moderators. As the author, you can still see it and appeal the decision.',
              author: const Author(
                id: 'currentUser',
                displayName: 'You',
                avatarUrl: null,
              ),
              moderationStatus: ModerationStatus.hidden,
            ),
            isOwnPost: true,
          ),

          // Community approved post
          PostCard(
            post: _createSamplePost(
              id: 'post5',
              title: 'Community Restored',
              content:
                  'This post was initially hidden but the community voted to restore it after an appeal. Democracy in action!',
              author: const Author(
                id: 'user3',
                displayName: 'Charlie Brown',
                avatarUrl: null,
              ),
              moderationStatus: ModerationStatus.communityApproved,
              appealStatus: 'approved',
            ),
          ),

          // Hidden post (other user's content - shows placeholder)
          PostCard(
            post: _createSamplePost(
              id: 'post6',
              title: 'Removed Content',
              content:
                  'This content has been removed and you cannot see it since you are not the author.',
              author: const Author(
                id: 'user4',
                displayName: 'David Wilson',
                avatarUrl: null,
              ),
              moderationStatus: ModerationStatus.hidden,
            ),
          ),

          // Under review post
          PostCard(
            post: _createSamplePost(
              id: 'post7',
              title: 'Under Review',
              content:
                  'This post is currently being reviewed by the moderation team. The status will be updated once review is complete.',
              author: const Author(
                id: 'user5',
                displayName: 'Eve Davis',
                avatarUrl: null,
              ),
              moderationStatus: ModerationStatus.flagged,
            ),
          ),

          // Demo instructions
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Try These Features:',
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                const Text(
                  '🚩 Tap "Report" on any post to see the flag dialog',
                ),
                const Text('⚠️ Check out moderation badges on flagged content'),
                const Text(
                  '🏛️ Tap appeal badges on your own posts to open appeal dialog',
                ),
                const Text('🧠 Review moderation states and appeal flows'),
                const Text(
                  '📊 Use the menu to access appeals and voting (coming next!)',
                ),
              ],
            ),
          ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Post _createSamplePost({
    required String id,
    String? title,
    required String content,
    required Author author,
    required ModerationStatus moderationStatus,
    String? appealStatus,
  }) {
    return Post(
      id: id,
      title: title,
      content: content,
      author: author,
      createdAt: DateTime.now().subtract(
        Duration(
          hours: (id.hashCode % 24).abs(),
          minutes: (id.hashCode % 60).abs(),
        ),
      ),
      moderationStatus: moderationStatus,
      appealStatus: appealStatus,
      likeCount: (id.hashCode % 100).abs(),
      commentCount: (id.hashCode % 20).abs(),
    );
  }

  void _handleMenuSelection(String value) {
    switch (value) {
      case 'appeals':
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Appeal History page coming in next implementation!'),
            backgroundColor: Colors.blue,
          ),
        );
        break;
      case 'voting':
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Community Voting page coming in next implementation!',
            ),
            backgroundColor: Colors.purple,
          ),
        );
        break;
      case 'settings':
        _showSettingsDialog();
        break;
    }
  }

  void _showSettingsDialog() {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Moderation Settings'),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text('Community Voting'),
              subtitle: Text('Participate in democratic content moderation'),
              trailing: Icon(Icons.arrow_forward_ios),
            ),
            ListTile(
              title: Text('Appeal Notifications'),
              subtitle: Text('Get notified about appeal decisions'),
              trailing: Icon(Icons.arrow_forward_ios),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}
