// ignore_for_file: public_member_api_docs

// ignore_for_file: use_build_context_synchronously

import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/design_system/components/lyth_avatar.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/core/network/idempotency_key.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/application/owner_posts.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/profile/application/follow_providers.dart';
import 'package:lythaus/features/profile/application/follow_service.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/features/profile/domain/owner_profile.dart';
import 'package:lythaus/features/profile/domain/owner_post.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/moderation_console_screen.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_empty_state.dart';
import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/ui/components/tier_badge.dart';
import 'package:lythaus/ui/theme/spacing.dart';
import 'package:lythaus/ui/screens/profile/settings_screen.dart';
import 'package:lythaus/ui/components/sign_in_required.dart';
import 'package:lythaus/ui/screens/profile/edit_profile_screen.dart';
import 'package:lythaus/ui/screens/profile/reputation_ledger_screen.dart';
import 'package:lythaus/ui/screens/rewards/monthly_reputation_widgets.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';
import 'package:lythaus/widgets/reputation_badge.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key, this.userId});

  /// When non-null, display this user's profile (read-only if not the
  /// current user). When null, falls back to the signed-in user's own profile.
  final String? userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentUser = ref.watch(currentUserProvider);
    final targetUserId = userId ?? currentUser?.id;

    if (targetUserId == null) {
      return ReadingPane(
        child: Scaffold(
          appBar: AppBar(title: const Text('Profile')),
          body: const SignInRequired(
            message: 'Sign in to view your profile details.',
            returnTo: '/?tab=profile',
          ),
        ),
      );
    }

    final isOwner = currentUser?.id == targetUserId;
    final ownerState = isOwner ? ref.watch(ownerProfileProvider) : null;
    final AsyncValue<PublicUser> profileState = isOwner
        ? ownerState!.whenData<PublicUser>((profile) => profile.user)
        : ref.watch(publicUserProvider(targetUserId));
    return profileState.when(
      data: (profile) =>
          _buildProfile(context, ref, profile, owner: ownerState?.valueOrNull),
      loading: () => ReadingPane(
        child: Scaffold(
          appBar: AppBar(title: const Text('Profile')),
          body: const Center(child: CircularProgressIndicator()),
        ),
      ),
      error: (error, stack) => ReadingPane(
        child: Scaffold(
          appBar: AppBar(title: const Text('Profile')),
          body: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const LythEmptyState(
                  icon: Icons.person_off_outlined,
                  title: 'Unable to load profile',
                  subtitle: 'Please try again.',
                ),
                TextButton(
                  onPressed: () => isOwner
                      ? ref.invalidate(ownerProfileProvider)
                      : ref.invalidate(publicUserProvider(targetUserId)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildProfile(
    BuildContext context,
    WidgetRef ref,
    PublicUser profile, {
    OwnerProfile? owner,
  }) {
    final currentUser = ref.read(currentUserProvider);
    final isOwner = currentUser != null && currentUser.id == profile.id;
    final canModerate =
        isOwner &&
        (currentUser.role == UserRole.moderator ||
            currentUser.role == UserRole.admin);
    if (isOwner) {
      _logProfileComplete(ref, profile, currentUser.id);
    }

    return ReadingPane(
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            profile.displayName.isEmpty ? 'Your profile' : profile.displayName,
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh),
              tooltip: 'Refresh profile',
              onPressed: () {
                ref.invalidate(publicUserProvider(profile.id));
                if (isOwner) {
                  ref.invalidate(ownerProfileProvider);
                  ref.invalidate(reputationProvider);
                  ref.invalidate(monthlyRewardsViewProvider);
                  final key = OwnerPostsKey(
                    userId: profile.id,
                    sessionRevision: ref.read(authSessionRevisionProvider),
                  );
                  ref
                      .read(ownerPostsTimelineProvider(key).notifier)
                      .refresh();
                }
              },
            ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            Row(
              children: [
                LythAvatar(
                  name: profile.displayName.isEmpty
                      ? profile.handleLabel ?? 'Member'
                      : profile.displayName,
                  imageUrl: profile.avatarUrl,
                ),
                const SizedBox(width: Spacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profile.displayName,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (profile.handleLabel case final handleLabel?) ...[
                        const SizedBox(height: Spacing.xs),
                        Text(
                          handleLabel,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                      const SizedBox(height: Spacing.xs),
                      TierBadge(label: 'Subscription: ${profile.tier}'),
                      if (isOwner) ...[
                        const SizedBox(height: Spacing.xs),
                        _ReputationStateBadge(),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            if (isOwner) ...[
              const SizedBox(height: Spacing.lg),
              const MonthlyReputationTrackerCard(),
            ],
            if (profile.bio?.trim().isNotEmpty == true) ...[
              const SizedBox(height: Spacing.lg),
              Text(profile.bio!, style: Theme.of(context).textTheme.bodyLarge),
            ],
            if (isOwner) ...[
              if (profile.bio?.trim().isNotEmpty != true) ...[
                const SizedBox(height: Spacing.lg),
                const _ProfileCompletionGuide(),
              ],
              const SizedBox(height: Spacing.lg),
              _OwnerPostsSection(userId: profile.id),
            ],
            if (!isOwner && currentUser != null) ...[
              const SizedBox(height: Spacing.lg),
              _FollowSection(
                profileId: profile.id,
                currentUserId: currentUser.id,
              ),
            ],
            const SizedBox(height: Spacing.lg),
            if (isOwner) ...[
              if (owner != null && owner.hasDetails) Text(owner.statusMessage),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: Text(
                  owner?.hasDetails == false
                      ? 'Complete your profile'
                      : 'Edit profile',
                ),
                subtitle: const Text(
                  'Optional — add or update your details at any time',
                ),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => EditProfileScreen(profile: owner!),
                  ),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.insights_outlined),
                title: const Text('Activity & Audit Log'),
                subtitle: const Text('Private reputation and account activity'),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const ReputationLedgerScreen(),
                  ),
                ),
              ),
              if (canModerate)
                ListTile(
                  leading: const Icon(Icons.shield_outlined),
                  title: const Text('Moderation hub'),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const ModerationConsoleScreen(),
                      ),
                    );
                  },
                ),
              ListTile(
                leading: const Icon(Icons.settings_outlined),
                title: const Text('Settings'),
                onTap: () {
                  final router = GoRouter.maybeOf(context);
                  if (router != null) {
                    router.go(
                      GoRouterState.of(
                        context,
                      ).uri.replace(path: '/settings').toString(),
                    );
                    return;
                  }
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const SettingsScreen(),
                    ),
                  );
                },
              ),
            ],
            const SizedBox(height: Spacing.lg),
          ],
        ),
      ),
    );
  }

  void _logProfileComplete(WidgetRef ref, PublicUser profile, String userId) {
    if (!_isProfileComplete(profile)) {
      return;
    }
    Future<void>.microtask(() async {
      await ref
          .read(analyticsEventTrackerProvider)
          .logEventOnce(
            ref.read(analyticsClientProvider),
            AnalyticsEvents.profileComplete,
            userId: userId,
          );
    });
  }

  bool _isProfileComplete(PublicUser profile) {
    return profile.displayName.trim().isNotEmpty;
  }
}

class _ProfileCompletionGuide extends StatelessWidget {
  const _ProfileCompletionGuide();

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(Spacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.person_outline,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: Spacing.md),
          Expanded(
            child: Text(
              'A short bio can add context to your profile. It is optional, and you can add it later from Edit profile.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
        ],
      ),
    ),
  );
}

class _OwnerPostsSection extends ConsumerWidget {
  const _OwnerPostsSection({required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentUserId = ref.watch(currentUserProvider)?.id;
    final sessionRevision = ref.watch(authSessionRevisionProvider);
    if (currentUserId != userId) return const SizedBox.shrink();
    final key = OwnerPostsKey(
      userId: userId,
      sessionRevision: sessionRevision,
    );
    final postsState = ref.watch(ownerPostsTimelineProvider(key));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Your posts', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: Spacing.sm),
        postsState.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: Spacing.md),
            child: Semantics(
              label: 'Loading your posts',
              child: LinearProgressIndicator(minHeight: 2),
            ),
          ),
          error: (error, stackTrace) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Unable to load your posts. Your profile is still available.'),
              TextButton.icon(
                onPressed: () => ref
                    .read(ownerPostsTimelineProvider(key).notifier)
                    .refresh(),
                icon: const Icon(Icons.refresh),
                label: const Text('Retry posts'),
              ),
            ],
          ),
          data: (timeline) => _buildTimeline(context, ref, key, timeline),
        ),
      ],
    );
  }

  Widget _buildTimeline(
    BuildContext context,
    WidgetRef ref,
    OwnerPostsKey key,
    OwnerPostsTimeline timeline,
  ) {
    if (timeline.items.isEmpty && !timeline.hasMore) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: Spacing.sm),
        child: Text(
          'You have not posted yet. Your posts will appear here after you share them.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final post in timeline.items) _OwnerPostCard(post: post),
        if (timeline.loadMoreError != null)
          Padding(
            padding: const EdgeInsets.only(bottom: Spacing.xs),
            child: Text(
              'More posts could not be loaded. Try again.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.error,
              ),
            ),
          ),
        if (timeline.hasMore)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: timeline.isLoadingMore
                  ? null
                  : () => ref
                      .read(ownerPostsTimelineProvider(key).notifier)
                      .loadMore(),
              icon: timeline.isLoadingMore
                  ? const SizedBox.square(
                      dimension: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.expand_more),
              label: Text(
                timeline.isLoadingMore
                    ? 'Loading more posts'
                    : timeline.loadMoreError == null
                    ? 'Load more posts'
                    : 'Retry loading posts',
              ),
            ),
          ),
      ],
    );
  }
}

class _OwnerPostCard extends StatelessWidget {
  const _OwnerPostCard({required this.post});

  final OwnerPost post;

  String get _visibilityDescription {
    if (post.isPending) return 'Only you can see this while it is under review.';
    if (post.visibility == 'private') return 'Only you can see this.';
    if (post.visibility == 'followers') return 'Visible to followers.';
    if (post.publishedAt == null) return 'Approved; publication is not confirmed yet.';
    return 'Published.';
  }

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: Spacing.sm),
    child: Padding(
      padding: const EdgeInsets.all(Spacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(post.body, style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: Spacing.sm),
          Wrap(
            spacing: Spacing.xs,
            runSpacing: Spacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Chip(label: Text(post.statusLabel)),
              Text(
                MaterialLocalizations.of(context).formatShortDate(
                  post.createdAt.toLocal(),
                ),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.xs),
          Text(
            _visibilityDescription,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    ),
  );
}

class _ReputationStateBadge extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reputation = ref.watch(reputationProvider);
    return reputation.when(
      data: (state) => ReputationBadge(
        state: state,
        size: ReputationBadgeSize.medium,
        showLabel: true,
      ),
      loading: () => Semantics(
        label: 'Loading reputation',
        child: const SizedBox(
          height: 20,
          width: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      error: (_, __) => Semantics(
        liveRegion: true,
        label: 'Unable to load reputation',
        child: TextButton.icon(
          onPressed: () => ref.invalidate(reputationProvider),
          icon: const Icon(Icons.refresh, size: 16),
          label: const Text('Retry reputation'),
        ),
      ),
    );
  }
}

class _FollowSection extends ConsumerStatefulWidget {
  const _FollowSection({required this.profileId, required this.currentUserId});

  final String profileId;
  final String currentUserId;

  @override
  ConsumerState<_FollowSection> createState() => _FollowSectionState();
}

class _FollowSectionState extends ConsumerState<_FollowSection> {
  bool _busy = false;
  CancelToken? _cancelToken;

  @override
  void dispose() {
    _cancelToken?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(authSessionRevisionProvider);
    ref.listen(authSessionRevisionProvider, (_, _) {
      _cancelToken?.cancel();
      if (mounted) setState(() => _busy = false);
    });
    if (ref.watch(currentUserProvider)?.id != widget.currentUserId) {
      return const SizedBox.shrink();
    }
    final followState = ref.watch(followStatusProvider(widget.profileId));

    return followState.when(
      data: (status) => status.blocked
          ? const ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.block_outlined),
              title: Text('Follow is unavailable for this account.'),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                LythButton.secondary(
                  label: _busy
                      ? 'Updating follow'
                      : status.following
                      ? 'Following'
                      : 'Follow',
                  icon: status.following ? Icons.check : Icons.person_add,
                  onPressed: _busy
                      ? null
                      : () => _toggleFollow(context, status),
                ),
                if (status.followedBy) ...[
                  const SizedBox(height: Spacing.xs),
                  Text(
                    'Follows you',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
      loading: () => const Semantics(
        label: 'Loading follow status',
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LythButton.secondary(
            label: 'Retry follow status',
            icon: Icons.refresh,
            onPressed: () => _retryLoad(ref),
          ),
          const SizedBox(height: Spacing.xs),
          Text(
            'Unable to load follow status.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  void _retryLoad(WidgetRef ref) {
    ref.invalidate(followStatusProvider(widget.profileId));
  }

  Future<void> _toggleFollow(
    BuildContext context,
    FollowStatus status,
  ) async {
    if (_busy || ref.read(currentUserProvider)?.id != widget.currentUserId) {
      return;
    }
    final revision = ref.read(authSessionRevisionProvider);
    final cancelToken = CancelToken();
    final stop = ref
        .read(authSessionRevisionProvider.notifier)
        .cancelOnChange(cancelToken.cancel);
    _cancelToken = cancelToken;
    setState(() => _busy = true);
    try {
      final token = await Future.any<String?>([
        ref.read(jwtProvider.future),
        cancelToken.whenCancel.then<String?>((error) => throw error),
      ]);
      if (!_isCurrentSession(revision, cancelToken)) return;
      if (token == null || token.isEmpty) {
        LythSnackbar.error(
          context: context,
          message: 'Sign in to follow accounts.',
        );
        return;
      }
      final service = ref.read(followServiceProvider);
      final idempotencyKey = IdempotencyKey.create(
        status.following ? 'follow-remove' : 'follow-create',
      );
      final updated = status.following
          ? await service.unfollow(
              targetUserId: widget.profileId,
              accessToken: token,
              idempotencyKey: idempotencyKey,
              cancelToken: cancelToken,
            )
          : await service.follow(
              targetUserId: widget.profileId,
              accessToken: token,
              idempotencyKey: idempotencyKey,
              cancelToken: cancelToken,
            );
      if (!_isCurrentSession(revision, cancelToken)) return;
      ref.invalidate(followStatusProvider(widget.profileId));

      if (!status.following && updated.created) {
        await ref
            .read(analyticsEventTrackerProvider)
            .logEventOnce(
              ref.read(analyticsClientProvider),
              AnalyticsEvents.firstFollow,
              userId: widget.currentUserId,
            );
      }
    } catch (error) {
      if (mounted &&
          !CancelToken.isCancel(error) &&
          _isCurrentSession(revision, cancelToken)) {
        ref.invalidate(followStatusProvider(widget.profileId));
        LythSnackbar.error(
          context: context,
          message: 'Follow action failed. Refresh and try again.',
        );
      }
    } finally {
      stop();
      if (identical(_cancelToken, cancelToken)) _cancelToken = null;
      if (mounted && _isCurrentSession(revision, cancelToken)) {
        setState(() => _busy = false);
      }
    }
  }

  bool _isCurrentSession(int revision, CancelToken cancelToken) {
    if (!mounted || cancelToken.isCancelled) return false;
    return ref.read(currentUserProvider)?.id == widget.currentUserId &&
        ref.read(authSessionRevisionProvider) == revision;
  }
}
