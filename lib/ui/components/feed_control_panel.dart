// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class FeedControlPanel extends ConsumerWidget {
  const FeedControlPanel({
    super.key,
    this.availableFeeds,
    this.selectedFeedId,
    this.onSelect,
    this.onCreateCustom,
    this.onOpenModerationHub,
    this.onOpenAppeals,
    this.onClose,
  });

  final List<FeedModel>? availableFeeds;
  final String? selectedFeedId;
  final ValueChanged<FeedModel>? onSelect;
  final VoidCallback? onCreateCustom;
  final VoidCallback? onOpenModerationHub;
  final VoidCallback? onOpenAppeals;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feeds = ref.watch(feedListProvider);
    final current = ref.watch(currentFeedProvider);
    final choices = availableFeeds ?? feeds;
    final activeFeedId = selectedFeedId ?? current.id;
    final allowFeedSwitching = onSelect != null;

    return Padding(
      padding: const EdgeInsets.all(Spacing.md),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  allowFeedSwitching ? 'Choose a feed' : 'Feed tools',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              if (onClose != null)
                IconButton(
                  tooltip: 'Close feed controls',
                  onPressed: onClose,
                  icon: const Icon(Icons.close),
                ),
            ],
          ),
          const SizedBox(height: Spacing.sm),
          if (allowFeedSwitching)
            if (choices.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: Spacing.sm),
                child: Text('No feeds are available yet.'),
              )
            else
              ...choices.map(
                (feed) => ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: Spacing.sm,
                  ),
                  title: Text(feed.name),
                  subtitle: Text(_subtitle(feed)),
                  trailing: feed.isHome
                      ? const Icon(Icons.home_filled, size: 18)
                      : null,
                  selected: feed.id == activeFeedId,
                  onTap: () => onSelect?.call(feed),
                ),
              ),
          const SizedBox(height: Spacing.sm),
          if (onCreateCustom != null)
            FilledButton.icon(
              onPressed: onCreateCustom,
              icon: const Icon(Icons.tune_rounded),
              label: const Text('Build custom feed'),
            ),
          const Divider(height: Spacing.xl),
          if (onOpenModerationHub != null)
            ListTile(
              leading: const Icon(Icons.shield_outlined),
              title: const Text('Moderation hub'),
              onTap: onOpenModerationHub,
            ),
          if (onOpenAppeals != null)
            ListTile(
              leading: const Icon(Icons.rule_folder_outlined),
              title: const Text('Appeals queue'),
              onTap: onOpenAppeals,
            ),
        ],
      ),
    );
  }

  String _subtitle(FeedModel feed) {
    switch (feed.type) {
      case FeedType.discover:
        return 'Curated discover';
      case FeedType.news:
        return 'Hybrid news';
      case FeedType.custom:
        return 'Custom filters';
      case FeedType.moderation:
        return 'Moderation only';
    }
  }
}
