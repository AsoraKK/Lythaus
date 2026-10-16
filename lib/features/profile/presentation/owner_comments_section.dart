// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/profile/application/owner_comments.dart';
import 'package:lythaus/features/profile/domain/owner_comment.dart';
import 'package:lythaus/features/profile/presentation/profile_content_status.dart';
import 'package:lythaus/ui/theme/spacing.dart';

bool ownerContentIsOffline(Object error) =>
    error is DioException &&
    const {
      DioExceptionType.connectionError,
      DioExceptionType.connectionTimeout,
      DioExceptionType.receiveTimeout,
      DioExceptionType.sendTimeout,
    }.contains(error.type);

class OwnerCommentsSection extends ConsumerWidget {
  const OwnerCommentsSection({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionRevision = ref.watch(authSessionRevisionProvider);
    if (ref.watch(currentUserProvider)?.id != userId) {
      return const SizedBox.shrink();
    }
    final key = OwnerCommentsKey(
      userId: userId,
      sessionRevision: sessionRevision,
    );
    final state = ref.watch(ownerCommentsTimelineProvider(key));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          container: true,
          header: true,
          child: Text(
            'Your comments',
            style: Theme.of(context).textTheme.titleLarge,
          ),
        ),
        const SizedBox(height: Spacing.sm),
        state.when(
          loading: () => const ProfileContentStatus(
            title: 'Loading your comments',
            icon: Icons.chat_bubble_outline,
            loading: true,
          ),
          error: (error, stack) => ProfileContentStatus(
            title: 'Comments could not be loaded',
            icon: Icons.chat_bubble_outline,
            message: ownerContentIsOffline(error)
                ? 'You appear to be offline. Connect to load your comments.'
                : 'Unable to load your comments. Your profile is still available.',
            onRetry: () =>
                ref.read(ownerCommentsTimelineProvider(key).notifier).refresh(),
            retryLabel: 'Retry comments',
          ),
          data: (timeline) => _timeline(context, ref, key, timeline),
        ),
      ],
    );
  }

  Widget _timeline(
    BuildContext context,
    WidgetRef ref,
    OwnerCommentsKey key,
    OwnerCommentsTimeline timeline,
  ) {
    if (timeline.items.isEmpty && !timeline.hasMore) {
      return const ProfileContentStatus(
        title: 'No comments to show',
        icon: Icons.chat_bubble_outline,
        message: 'No comments are available in this list.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final comment in timeline.items)
          Card(
            margin: const EdgeInsets.only(bottom: Spacing.sm),
            child: Padding(
              padding: const EdgeInsets.all(Spacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    comment.body,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: Spacing.sm),
                  Wrap(
                    spacing: Spacing.xs,
                    runSpacing: Spacing.xs,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Chip(
                        label: Text(comment.depth == 1 ? 'Reply' : 'Comment'),
                      ),
                      Chip(label: Text(comment.statusLabel)),
                      Text(
                        MaterialLocalizations.of(
                          context,
                        ).formatMediumDate(comment.createdAt.toLocal()),
                      ),
                    ],
                  ),
                  if (comment.isPending)
                    const Text(
                      'Only you can see this while it is under review.',
                    ),
                ],
              ),
            ),
          ),
        if (timeline.loadMoreError != null)
          Text(
            ownerContentIsOffline(timeline.loadMoreError!)
                ? 'You appear to be offline. Connect to load more comments.'
                : 'More comments could not be loaded. Try again.',
          ),
        if (timeline.hasMore)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: timeline.isLoadingMore
                  ? null
                  : () => ref
                        .read(ownerCommentsTimelineProvider(key).notifier)
                        .loadMore(),
              icon: timeline.isLoadingMore
                  ? const SizedBox.square(
                      dimension: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.expand_more),
              label: Text(
                timeline.isLoadingMore
                    ? 'Loading more comments'
                    : timeline.loadMoreError == null
                    ? 'Load more comments'
                    : 'Retry loading comments',
              ),
            ),
          ),
      ],
    );
  }
}
