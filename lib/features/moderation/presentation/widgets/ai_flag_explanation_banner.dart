// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/design_system/tokens/semantic_colors.dart';

/// Banner shown to users when their content is flagged by AI moderation.
///
/// Explains the automated nature of the decision and provides clear
/// instructions for appealing. Shown on post cards when the user
/// owns the content and it has been flagged or blocked.
class AiFlagExplanationBanner extends StatelessWidget {
  /// Whether the content was fully blocked (true) or just flagged (false).
  final bool isBlocked;

  /// Callback to initiate an appeal. If null, the appeal button is hidden.
  final VoidCallback? onAppeal;

  /// Callback to dismiss the banner.
  final VoidCallback? onDismiss;

  const AiFlagExplanationBanner({
    super.key,
    required this.isBlocked,
    this.onAppeal,
    this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isLight = Theme.of(context).brightness == Brightness.light;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isBlocked
            ? scheme.errorContainer
            : (isLight
                  ? LythSemanticColors.warning
                  : LythSemanticColors.warning.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isBlocked
              ? scheme.error.withValues(alpha: 0.4)
              : LythSemanticColors.warning.withValues(alpha: 0.4),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isBlocked ? Icons.block : Icons.info_outline,
                size: 20,
                color: isBlocked ? scheme.error : LythSemanticColors.warning,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  isBlocked
                      ? 'Content blocked by automated review'
                      : 'Content flagged for review',
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              if (onDismiss != null)
                GestureDetector(
                  onTap: onDismiss,
                  child: Icon(Icons.close, size: 18, color: scheme.onSurface),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            isBlocked
                ? 'Our automated system determined this content may violate '
                      'community guidelines. This decision was made by an AI and '
                      'may be incorrect. You can appeal for a human review.'
                : 'Our automated system flagged this content for additional '
                      'review. Your post is still visible while under review. '
                      'If you believe this is an error, you can submit an appeal.',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: scheme.onSurface),
          ),
          if (onAppeal != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onAppeal,
                icon: const Icon(Icons.gavel, size: 16),
                label: const Text('Appeal this decision'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: isBlocked
                      ? scheme.error
                      : LythSemanticColors.warning,
                  side: BorderSide(
                    color: isBlocked
                        ? scheme.error.withValues(alpha: 0.4)
                        : LythSemanticColors.warning.withValues(alpha: 0.4),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
