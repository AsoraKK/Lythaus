// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/feed_actions_service.dart';
import 'package:lythaus/features/feed/application/feed_read_session.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/components/receipt_drawer.dart';
import 'package:lythaus/ui/components/sign_in_required.dart';
import 'package:lythaus/ui/screens/profile/reputation_ledger_screen.dart';

class InteractiveFeedCard extends ConsumerWidget {
  const InteractiveFeedCard({
    super.key,
    required this.item,
    this.onTap,
    this.canEdit = false,
    this.onEdit,
  });
  final FeedItem item;
  final VoidCallback? onTap;
  final bool canEdit;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      item.interactionPostId == null
      ? FeedCard(
          item: item,
          actions: const Text(
            'Post interactions are unavailable for this publication.',
          ),
        )
      : _FeedActions(
          key: ValueKey((item.id, ref.watch(feedReadSessionProvider))),
          item: item,
          onTap: onTap,
          canEdit: canEdit,
          onEdit: onEdit,
        );
}

class _FeedActions extends ConsumerStatefulWidget {
  const _FeedActions({
    super.key,
    required this.item,
    this.onTap,
    required this.canEdit,
    this.onEdit,
  });
  final FeedItem item;
  final VoidCallback? onTap;
  final bool canEdit;
  final VoidCallback? onEdit;
  @override
  ConsumerState<_FeedActions> createState() => _FeedActionsState();
}

class _FeedActionsState extends ConsumerState<_FeedActions> {
  String get _postId => widget.item.interactionPostId!;
  bool _busy = false;
  String? _error;
  bool get _selectedUseful =>
      ref.read(confirmedUsefulProvider)[_postId] ??
      widget.item.viewerReaction == 'insightful';

  void _notice(String message) {
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  bool _signedIn() {
    if (ref.read(feedReadSessionProvider).isAuthenticated) return true;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Sign in')),
          body: SignInRequired(
            message: 'Sign in to save, react, mute or report.',
            returnTo: '/post/$_postId',
          ),
        ),
      ),
    );
    return false;
  }

  Future<void> _mutate(
    String kind,
    Future<void> Function(String token) action,
    VoidCallback confirmed,
  ) async {
    if (_busy ||
        ref.read(pendingFeedActionsProvider).containsKey(_postId) ||
        !_signedIn()) {
      return;
    }
    final session = ref.read(feedReadSessionProvider);
    final container = ProviderScope.containerOf(context, listen: false);
    final pending = ref.read(pendingFeedActionsProvider.notifier);
    final postId = _postId;
    pending.state = {...pending.state, postId: '$kind:busy'};
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final token = await session.readToken();
      session.requireCurrent();
      await action(token!);
      if (!session.isCurrent) return;
      pending.state = {...pending.state}..remove(postId);
      container.invalidate(feedBookmarksProvider);
      if (kind == 'mute') {
        container.invalidate(liveFeedStateProvider);
        container.invalidate(liveFeedItemsProvider);
      }
      if (mounted) confirmed();
    } catch (error) {
      if (!session.isCurrent) return;
      final cause = error is SocialFeedException ? error.originalError : error;
      final status = cause is DioException ? cause.response?.statusCode : null;
      final denied =
          status != null && status >= 400 && status < 500 && status != 409;
      pending.state = denied
          ? ({...pending.state}..remove(postId))
          : {...pending.state, postId: kind};
      if (mounted) {
        setState(() {
          _error = denied
              ? 'This action was not accepted. Check your access and try again.'
              : 'The change could not be confirmed. Check your account activity before trying again.';
        });
      }
    } finally {
      if (mounted && session.isCurrent) setState(() => _busy = false);
    }
  }

  Future<void> _sheet(String title, List<Widget> children) async {
    final session = ref.read(feedReadSessionProvider);
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => Consumer(
        builder: (context, sheetRef, _) {
          if (!identical(sheetRef.watch(feedReadSessionProvider), session)) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (sheetContext.mounted) Navigator.of(sheetContext).pop();
            });
            return const SizedBox.shrink();
          }
          return CallbackShortcuts(
            bindings: {
              const SingleActivator(LogicalKeyboardKey.escape): () =>
                  Navigator.of(sheetContext).pop(),
            },
            child: Focus(
              autofocus: true,
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(context).height * .85,
                ),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              title,
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                          ),
                          IconButton(
                            tooltip: 'Close',
                            onPressed: () => Navigator.of(sheetContext).pop(),
                            icon: const Icon(Icons.close),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      ...children,
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  void _usefulPressed() {
    if (!_signedIn()) return;
    if (_selectedUseful) {
      _setUseful();
      return;
    }
    if (!ref.read(feedbackExplainedProvider)) {
      _sheet('About contribution feedback', [
        const Text(
          'Useful marks the contribution as insightful, not approval of what happened. It replaces your existing reaction to this post. Reactions do not directly change author reputation or rewards.',
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () {
            ref.read(feedbackExplainedProvider.notifier).state = true;
            Navigator.of(context).pop();
            _setUseful();
          },
          child: const Text('Mark useful'),
        ),
      ]);
      return;
    }
    _setUseful();
  }

  void _setUseful() {
    final selected = !_selectedUseful;
    final useful = ref.read(confirmedUsefulProvider.notifier);
    final session = ref.read(feedReadSessionProvider);
    final service = ref.read(feedActionsServiceProvider);
    final postId = _postId;
    _mutate('useful', (token) async {
      await service.useful(postId, selected, token);
      if (session.isCurrent) useful.state = {...useful.state, postId: selected};
    }, () {});
  }

  void _emotions() => _sheet('Reacting to the story', [
    const Text(
      'Story emotions are not available yet. They will be separate from feedback on the contribution. No emotion has been recorded.',
    ),
    const SizedBox(height: 12),
    const Text(
      'Useful is about the contribution, not how you feel about the events.',
    ),
  ]);

  void _negativeFeedback() => _sheet('Feedback on the contribution', [
    const Text(
      'Negative feedback is not recorded yet. You can discuss an argument or report an accuracy concern without rating the author.',
    ),
    const ListTile(
      enabled: false,
      leading: Icon(Icons.thumb_down_outlined),
      title: Text('Not useful to me'),
      subtitle: Text('Not available yet'),
    ),
    ListTile(
      leading: const Icon(Icons.chat_bubble_outline),
      title: const Text('I disagree with the argument'),
      subtitle: const Text('Discuss it in comments'),
      onTap: () {
        Navigator.of(context).pop();
        _comments();
      },
    ),
    ListTile(
      leading: const Icon(Icons.flag_outlined),
      title: const Text('Concern about accuracy'),
      subtitle: const Text('Review and submit a report'),
      onTap: () {
        Navigator.of(context).pop();
        _report();
      },
    ),
    ListTile(
      leading: const Icon(Icons.add_reaction_outlined),
      title: const Text('I’m reacting to what happened'),
      subtitle: const Text('About story emotions'),
      onTap: () {
        Navigator.of(context).pop();
        _emotions();
      },
    ),
  ]);

  void _comments() => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => CommentThreadScreen(postId: _postId),
    ),
  );

  void _report() {
    final service = ref.read(socialFeedServiceProvider);
    final postId = _postId;
    if (!_signedIn()) return;
    var reason = 'misinformation';
    _sheet('Report post', [
      const Text(
        'A report requests review; it does not establish that the author is wrong. Reports are assessed regardless of the author’s reputation.',
      ),
      const SizedBox(height: 16),
      DropdownButtonFormField<String>(
        initialValue: reason,
        decoration: const InputDecoration(labelText: 'Reason'),
        items: const [
          DropdownMenuItem(
            value: 'misinformation',
            child: Text('Concern about accuracy'),
          ),
          DropdownMenuItem(value: 'spam', child: Text('Spam')),
          DropdownMenuItem(value: 'harassment', child: Text('Harassment')),
          DropdownMenuItem(value: 'other', child: Text('Other concern')),
        ],
        onChanged: (value) => reason = value ?? reason,
      ),
      const SizedBox(height: 16),
      FilledButton(
        onPressed: () {
          Navigator.of(context).pop();
          _mutate(
            'report',
            (token) =>
                service.flagPost(postId: postId, reason: reason, token: token),
            () => _notice('Report submitted for review.'),
          );
        },
        child: const Text('Submit report'),
      ),
    ]);
  }

  void _mute() {
    final service = ref.read(feedActionsServiceProvider);
    final authorId = widget.item.authorId;
    if (!_signedIn()) return;
    _sheet('Mute this account?', [
      const Text(
        'Their posts will be filtered from your personalised feeds. This does not report them or change their reputation.',
      ),
      const SizedBox(height: 16),
      FilledButton(
        onPressed: () {
          Navigator.of(context).pop();
          _mutate('mute', (token) => service.mute(authorId!, token), () {
            _notice('Account muted.');
            ref.invalidate(liveFeedStateProvider);
            ref.invalidate(liveFeedItemsProvider);
          });
        },
        child: const Text('Mute account'),
      ),
    ]);
  }

  Future<void> _share() async {
    try {
      await Clipboard.setData(
        ClipboardData(
          text: Uri.https(
            'app.lythaus.co',
            '/post/${Uri.encodeComponent(_postId)}',
          ).toString(),
        ),
      );
      _notice('Post link copied.');
    } catch (_) {
      _notice('Couldn’t copy the link. Try again.');
    }
  }

  void _sources() {
    final item = widget.item;
    final uri = Uri.tryParse(item.sourceUrl ?? '');
    _sheet('Sources', [
      Text(
        item.sourceName?.isNotEmpty == true
            ? item.sourceName!
            : 'No source name provided.',
      ),
      if (uri != null && ['https', 'http'].contains(uri.scheme))
        TextButton(
          onPressed: () async {
            try {
              if (await launchUrl(uri, mode: LaunchMode.externalApplication)) {
                return;
              }
            } catch (_) {}
            _notice('Couldn’t open the source.');
          },
          child: const Text('Open source'),
        )
      else
        const Text('No source link provided.'),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final bookmarks = ref.watch(feedBookmarksProvider);
    final saved =
        !bookmarks.isLoading &&
        (bookmarks.asData?.value.contains(_postId) ?? false);
    final selected =
        ref.watch(confirmedUsefulProvider)[_postId] ??
        widget.item.viewerReaction == 'insightful';
    final pending = ref.watch(pendingFeedActionsProvider)[_postId];
    final isOwn = ref.watch(currentUserProvider)?.id == widget.item.authorId;
    final enabled = !_busy && pending == null;
    final service = ref.read(feedActionsServiceProvider);
    final postId = _postId;
    return FeedCard(
      item: widget.item,
      onTap: widget.onTap,
      canEdit: widget.canEdit,
      onEdit: widget.onEdit,
      saveAction: IconButton(
        tooltip: bookmarks.hasError
            ? 'Saved state unavailable'
            : saved
            ? 'Remove saved post'
            : 'Save post',
        onPressed: !enabled || bookmarks.isLoading
            ? null
            : bookmarks.hasError
            ? () => ref.invalidate(feedBookmarksProvider)
            : () => _mutate(
                'bookmark',
                (token) => service.bookmark(postId, !saved, token),
                () {
                  ref.invalidate(feedBookmarksProvider);
                  _notice(
                    saved ? 'Post removed from saved posts.' : 'Post saved.',
                  );
                },
              ),
        icon: Icon(saved ? Icons.bookmark : Icons.bookmark_add_outlined),
      ),
      actions: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 2,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              TextButton.icon(
                onPressed: enabled && !isOwn ? _usefulPressed : null,
                icon: Icon(
                  selected ? Icons.thumb_up : Icons.thumb_up_outlined,
                  size: 20,
                ),
                label: Text(selected ? 'Useful ✓' : 'Useful'),
              ),
              IconButton(
                tooltip: 'Negative feedback',
                onPressed: enabled ? _negativeFeedback : null,
                icon: const Icon(Icons.thumb_down_outlined, size: 20),
              ),
              IconButton(
                tooltip: 'Story emotions — unavailable',
                onPressed: _emotions,
                icon: const Icon(Icons.add_reaction_outlined, size: 20),
              ),
              IconButton(
                tooltip: 'Comments',
                onPressed: _comments,
                icon: const Icon(Icons.chat_bubble_outline, size: 20),
              ),
              IconButton(
                tooltip: 'Share post link',
                onPressed: _share,
                icon: const Icon(Icons.ios_share_outlined, size: 20),
              ),
              PopupMenuButton<String>(
                tooltip: 'Post actions',
                icon: const Icon(Icons.more_horiz),
                onSelected: (action) {
                  switch (action) {
                    case 'details':
                      ReceiptDrawer.show(context, _postId);
                    case 'sources':
                      _sources();
                    case 'why':
                      _sheet('Why this post is shown', [
                        const Text(
                          'This post was returned by the selected feed. Lythaus does not provide a post-specific recommendation explanation yet.',
                        ),
                      ]);
                    case 'mute':
                      _mute();
                    case 'report':
                      _report();
                    case 'edit':
                      widget.onEdit?.call();
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'details',
                    child: Text('Post details'),
                  ),
                  const PopupMenuItem(value: 'sources', child: Text('Sources')),
                  const PopupMenuItem(value: 'why', child: Text('Why shown')),
                  if (!isOwn && widget.item.authorId?.isNotEmpty == true)
                    PopupMenuItem(
                      value: 'mute',
                      enabled: enabled,
                      child: const Text('Mute account'),
                    ),
                  PopupMenuItem(
                    value: 'report',
                    enabled: enabled,
                    child: const Text('Report'),
                  ),
                  if (widget.canEdit && widget.onEdit != null)
                    PopupMenuItem(
                      value: 'edit',
                      enabled: enabled,
                      child: const Text('Edit post'),
                    ),
                ],
              ),
            ],
          ),
          if (_busy)
            const LinearProgressIndicator(semanticsLabel: 'Saving change'),
          if (_error != null)
            Semantics(
              liveRegion: true,
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (pending != null && !pending.endsWith(':busy')) ...[
            if (_error == null)
              const Text('A previous change is not yet confirmed.'),
            if (pending == 'report')
              const Text(
                'The report is still unconfirmed. Account activity may help you review it, but cannot confirm this report here. It will not be retried automatically.',
              ),
            if (pending == 'report')
              TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const ReputationLedgerScreen(),
                  ),
                ),
                child: const Text('Review account activity'),
              )
            else
              TextButton(
                onPressed: _busy ? null : () => _checkStatus(pending),
                child: const Text('Check current state'),
              ),
          ],
        ],
      ),
    );
  }

  Future<void> _checkStatus(String kind) async {
    final session = ref.read(feedReadSessionProvider);
    final pending = ref.read(pendingFeedActionsProvider.notifier);
    final useful = ref.read(confirmedUsefulProvider.notifier);
    final service = ref.read(feedActionsServiceProvider);
    final container = ProviderScope.containerOf(context, listen: false);
    setState(() => _busy = true);
    try {
      final token = await session.readToken();
      session.requireCurrent();
      if (kind == 'bookmark') {
        final current = await container.refresh(feedBookmarksProvider.future);
        if (!current.contains(_postId) && mounted) {
          _notice('This post is not saved.');
        }
      } else if (kind == 'useful') {
        final selected = await service.readUseful(_postId, token!);
        session.requireCurrent();
        useful.state = {...useful.state, _postId: selected};
      } else if (kind == 'mute') {
        final muted = await service.readMutes(token!);
        session.requireCurrent();
        if (muted.contains(widget.item.authorId)) {
          container.invalidate(liveFeedStateProvider);
          container.invalidate(liveFeedItemsProvider);
        } else if (mounted) {
          _notice('This account is not muted.');
        }
      }
      if (!mounted || !session.isCurrent) return;
      pending.state = {...pending.state}..remove(_postId);
      setState(() => _error = null);
      _notice('Current state checked. You can continue.');
    } catch (_) {
      if (mounted && session.isCurrent) {
        _notice('Couldn’t check the current state. No change was retried.');
      }
    } finally {
      if (mounted && session.isCurrent) setState(() => _busy = false);
    }
  }
}
