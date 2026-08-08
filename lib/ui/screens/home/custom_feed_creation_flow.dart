// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/components/filter_modal.dart';
import 'package:lythaus/ui/theme/spacing.dart';

/// Multi-step custom feed creation wizard (3 layers + naming + confirmation)
class CustomFeedCreationFlow extends ConsumerStatefulWidget {
  const CustomFeedCreationFlow({super.key});

  @override
  ConsumerState<CustomFeedCreationFlow> createState() =>
      _CustomFeedCreationFlowState();
}

class _CustomFeedCreationFlowState
    extends ConsumerState<CustomFeedCreationFlow> {
  int _currentStep = 0;
  bool _isCreating = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Custom Feed'),
        centerTitle: true,
        elevation: 0,
      ),
      body: _buildStep(_currentStep),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Spacing.md),
          child: Row(
            children: [
              if (_currentStep > 0)
                Expanded(
                  child: OutlinedButton(
                    onPressed: _previousStep,
                    child: const Text('Back'),
                  ),
                ),
              if (_currentStep > 0) const SizedBox(width: Spacing.sm),
              Expanded(
                child: FilledButton(
                  onPressed: _isCreating ? null : _handlePrimaryAction,
                  child: _isCreating
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(_currentStep >= 4 ? 'Create' : 'Next'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStep(int step) {
    switch (step) {
      case 0:
        return _Step1ContentType();
      case 1:
        return _Step2Sorting();
      case 2:
        return _Step3Refinements();
      case 3:
        return _Step4Naming();
      case 4:
        return const _Step5Confirmation();
      default:
        return const SizedBox();
    }
  }

  void _nextStep() {
    if (_currentStep < 4) {
      setState(() => _currentStep++);
    }
  }

  void _previousStep() {
    if (_currentStep > 0) {
      setState(() => _currentStep--);
    }
  }

  Future<void> _handlePrimaryAction() async {
    if (_currentStep < 4) {
      _nextStep();
      return;
    }

    final draft = ref.read(customFeedDraftProvider);
    if (draft.name.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Choose a name before creating the feed.'),
        ),
      );
      return;
    }

    final token = await ref.read(jwtProvider.future);
    if (token == null || token.isEmpty) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to create a custom feed.')),
      );
      return;
    }

    setState(() => _isCreating = true);
    try {
      final created = await ref
          .read(customFeedServiceProvider)
          .createCustomFeed(token: token, draft: draft);

      ref.read(customFeedDraftProvider.notifier).reset();
      ref.invalidate(customFeedsProvider);
      try {
        final refreshedFeeds = await ref.refresh(customFeedsProvider.future);
        if (refreshedFeeds.isEmpty) {
          ref.invalidate(customFeedsProvider);
        }
      } catch (_) {
        // The feed is already created server-side; UI can still proceed.
      }

      final feeds = ref.read(feedListProvider);
      final index = feeds.indexWhere((feed) => feed.id == created.id);
      if (index >= 0) {
        ref.read(currentFeedIndexProvider.notifier).state = index;
      }

      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Created "${created.name}"')));
      Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not create feed: ${error.toString()}')),
      );
    } finally {
      if (mounted) {
        setState(() => _isCreating = false);
      }
    }
  }
}

/// Step 1: Select content type
class _Step1ContentType extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(customFeedDraftProvider);
    final notifier = ref.read(customFeedDraftProvider.notifier);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(Spacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'What type of content?',
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: Spacing.sm),
          Text(
            'Choose what kinds of posts you want to see in this feed.',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: Spacing.lg),
          Wrap(
            spacing: Spacing.sm,
            runSpacing: Spacing.sm,
            children: ContentType.values
                .where((t) => t != ContentType.mixed)
                .map((type) {
                  final selected = draft.contentType == type;
                  return ChoiceChip(
                    selected: selected,
                    label: Text(_contentTypeLabel(type)),
                    onSelected: (_) => notifier.setContentType(type),
                  );
                })
                .toList(),
          ),
        ],
      ),
    );
  }

  String _contentTypeLabel(ContentType type) {
    return switch (type) {
      ContentType.text => 'Text posts',
      ContentType.image => 'Images',
      ContentType.video => 'Videos',
      ContentType.mixed => 'Mixed content',
    };
  }
}

/// Step 2: Select sorting rule
class _Step2Sorting extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(customFeedDraftProvider);
    final notifier = ref.read(customFeedDraftProvider.notifier);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(Spacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'How should posts be sorted?',
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: Spacing.sm),
          Text(
            'Choose the order in which posts appear in your feed.',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: Spacing.lg),
          ...SortingRule.values.map((rule) {
            final selected = draft.sorting == rule;
            return Padding(
              padding: const EdgeInsets.only(bottom: Spacing.sm),
              child: _SortingOptionTile(
                label: _sortingLabel(rule),
                description: _sortingDescription(rule),
                selected: selected,
                onTap: () => notifier.setSorting(rule),
              ),
            );
          }),
        ],
      ),
    );
  }

  String _sortingLabel(SortingRule rule) {
    return switch (rule) {
      SortingRule.hot => 'Hot',
      SortingRule.newest => 'Newest',
      SortingRule.relevant => 'Most relevant',
      SortingRule.following => 'From people I follow',
      SortingRule.local => 'Local',
    };
  }

  String _sortingDescription(SortingRule rule) {
    return switch (rule) {
      SortingRule.hot => 'Trending content right now',
      SortingRule.newest => 'Most recent posts first',
      SortingRule.relevant => 'Posts matched to your interests',
      SortingRule.following => 'Only from accounts you follow',
      SortingRule.local => 'Posts from your region',
    };
  }
}

/// Step 3: Add refinements (keywords, accounts)
class _Step3Refinements extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FilterModal(onNext: () {});
  }
}

/// Step 4: Name the feed
class _Step4Naming extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(customFeedDraftProvider);
    final notifier = ref.read(customFeedDraftProvider.notifier);
    final controller = TextEditingController(text: draft.name);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(Spacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Name your feed',
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: Spacing.sm),
          Text(
            'Give your feed a short, memorable name.',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: Spacing.lg),
          TextField(
            controller: controller,
            decoration: const InputDecoration(
              hintText: 'e.g., "Tech News", "Art & Design"',
              border: OutlineInputBorder(),
            ),
            onChanged: (value) => notifier.setName(value),
          ),
        ],
      ),
    );
  }
}

/// Step 5: Confirmation - set as home feed?
class _Step5Confirmation extends ConsumerWidget {
  const _Step5Confirmation();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(customFeedDraftProvider);
    final notifier = ref.read(customFeedDraftProvider.notifier);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(Spacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Almost there!',
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: Spacing.lg),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(Spacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Feed Summary',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: Spacing.sm),
                  _summaryRow(context, 'Name', draft.name),
                  _summaryRow(
                    context,
                    'Content',
                    _contentTypeLabel(draft.contentType),
                  ),
                  _summaryRow(context, 'Sorting', _sortingLabel(draft.sorting)),
                  if (draft.refinements.includeKeywords.isNotEmpty)
                    _summaryRow(
                      context,
                      'Include keywords',
                      draft.refinements.includeKeywords.join(', '),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: Spacing.lg),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Set as home feed'),
            subtitle: const Text(
              'Make this your default feed when you open Lythaus',
            ),
            value: draft.setAsHome,
            onChanged: (value) => notifier.setHome(value),
          ),
        ],
      ),
    );
  }

  Widget _summaryRow(BuildContext context, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Spacing.xs),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          Text(value),
        ],
      ),
    );
  }

  String _contentTypeLabel(ContentType type) {
    return switch (type) {
      ContentType.text => 'Text posts',
      ContentType.image => 'Images',
      ContentType.video => 'Videos',
      ContentType.mixed => 'Mixed content',
    };
  }

  String _sortingLabel(SortingRule rule) {
    return switch (rule) {
      SortingRule.hot => 'Hot',
      SortingRule.newest => 'Newest',
      SortingRule.relevant => 'Most relevant',
      SortingRule.following => 'From people I follow',
      SortingRule.local => 'Local',
    };
  }
}

/// Reusable sorting option tile
class _SortingOptionTile extends StatelessWidget {
  const _SortingOptionTile({
    required this.label,
    required this.description,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String description;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? Theme.of(context).colorScheme.primaryContainer
          : Colors.transparent,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(Spacing.md),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: Spacing.xxs),
                    Text(
                      description,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              if (selected)
                Icon(
                  Icons.check_circle,
                  color: Theme.of(context).colorScheme.primary,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
