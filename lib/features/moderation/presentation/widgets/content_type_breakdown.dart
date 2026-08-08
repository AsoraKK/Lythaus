// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/features/core/utils/content_type_helper.dart';

/// LYTHAUS CONTENT TYPE BREAKDOWN WIDGET
///
/// 🎯 Purpose: Display breakdown of appeals by content type
/// 🔍 Single Responsibility: Content type analytics only

class ContentTypeBreakdown extends StatelessWidget {
  final List<Appeal> appeals;

  const ContentTypeBreakdown({super.key, required this.appeals});

  @override
  Widget build(BuildContext context) {
    final contentTypes = _calculateContentTypeBreakdown();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Appeals by Content Type',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            ...contentTypes.entries.map(
              (entry) => _buildContentTypeRow(context, entry),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContentTypeRow(
    BuildContext context,
    MapEntry<String, int> entry,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(
            ContentTypeHelper.getIcon(entry.key),
            size: 16,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(width: 8),
          Text(entry.key.toUpperCase()),
          const Spacer(),
          Text(
            entry.value.toString(),
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Map<String, int> _calculateContentTypeBreakdown() {
    final contentTypes = <String, int>{};
    for (final appeal in appeals) {
      contentTypes[appeal.contentType] =
          (contentTypes[appeal.contentType] ?? 0) + 1;
    }
    return contentTypes;
  }
}
