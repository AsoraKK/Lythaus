// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class FilterModal extends ConsumerStatefulWidget {
  const FilterModal({super.key, this.onNext});

  final VoidCallback? onNext;

  @override
  ConsumerState<FilterModal> createState() => _FilterModalState();
}

class _FilterModalState extends ConsumerState<FilterModal> {
  late final TextEditingController includeController;
  late final TextEditingController excludeController;
  late final TextEditingController includeAccountsController;
  late final TextEditingController excludeAccountsController;

  @override
  void initState() {
    super.initState();
    final draft = ref.read(customFeedDraftProvider);
    includeController = TextEditingController(
      text: draft.refinements.includeKeywords.join(', '),
    );
    excludeController = TextEditingController(
      text: draft.refinements.excludeKeywords.join(', '),
    );
    includeAccountsController = TextEditingController(
      text: draft.refinements.includeAccounts.join(', '),
    );
    excludeAccountsController = TextEditingController(
      text: draft.refinements.excludeAccounts.join(', '),
    );
  }

  @override
  void dispose() {
    includeController.dispose();
    excludeController.dispose();
    includeAccountsController.dispose();
    excludeAccountsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(customFeedDraftProvider);
    final notifier = ref.read(customFeedDraftProvider.notifier);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(Spacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Custom feed filters',
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: Spacing.md),
          _sectionHeader('Content type'),
          Wrap(
            spacing: Spacing.xs,
            children: ContentType.values.map((type) {
              final selected = draft.contentType == type;
              return ChoiceChip(
                label: Text(_label(type)),
                selected: selected,
                onSelected: (_) => notifier.setContentType(type),
              );
            }).toList(),
          ),
          const SizedBox(height: Spacing.md),
          _sectionHeader('Sorting'),
          Wrap(
            spacing: Spacing.xs,
            children: SortingRule.values.map((rule) {
              final selected = draft.sorting == rule;
              return ChoiceChip(
                label: Text(_sortingLabel(rule)),
                selected: selected,
                onSelected: (_) => notifier.setSorting(rule),
              );
            }).toList(),
          ),
          const SizedBox(height: Spacing.md),
          _sectionHeader('Refinements'),
          _textField('Include keywords', includeController),
          _textField('Exclude keywords', excludeController),
          _textField('Include accounts', includeAccountsController),
          _textField('Exclude accounts', excludeAccountsController),
          const SizedBox(height: Spacing.md),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Set as home feed'),
            value: draft.setAsHome,
            onChanged: (value) => notifier.setHome(value),
          ),
          const SizedBox(height: Spacing.md),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              onPressed: () {
                notifier.updateRefinements(
                  FeedRefinements(
                    includeKeywords: _split(includeController.text),
                    excludeKeywords: _split(excludeController.text),
                    includeAccounts: _split(includeAccountsController.text),
                    excludeAccounts: _split(excludeAccountsController.text),
                  ),
                );
                widget.onNext?.call();
              },
              child: const Text('Save refinements'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionHeader(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.xs),
      child: Text(text, style: Theme.of(context).textTheme.titleSmall),
    );
  }

  Widget _textField(String label, TextEditingController controller) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.sm),
      child: TextField(
        controller: controller,
        decoration: InputDecoration(
          labelText: label,
          hintText: 'Comma separated',
        ),
        maxLines: 2,
      ),
    );
  }

  String _label(ContentType type) {
    switch (type) {
      case ContentType.text:
        return 'Text';
      case ContentType.image:
        return 'Images';
      case ContentType.video:
        return 'Videos';
      case ContentType.mixed:
        return 'Mixed';
    }
  }

  String _sortingLabel(SortingRule rule) {
    switch (rule) {
      case SortingRule.hot:
        return 'Hot';
      case SortingRule.newest:
        return 'New';
      case SortingRule.relevant:
        return 'Relevant';
      case SortingRule.following:
        return 'Following';
      case SortingRule.local:
        return 'Local';
    }
  }

  List<String> _split(String input) {
    return input
        .split(',')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }
}
