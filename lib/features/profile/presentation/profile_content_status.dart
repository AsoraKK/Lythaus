// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/ui/theme/spacing.dart';

/// A readable, announced state for a profile content list.
class ProfileContentStatus extends StatelessWidget {
  const ProfileContentStatus({
    super.key,
    required this.title,
    required this.icon,
    this.message,
    this.loading = false,
    this.retryLabel,
    this.onRetry,
  }) : assert(onRetry == null || retryLabel != null);

  final String title;
  final IconData icon;
  final String? message;
  final bool loading;
  final String? retryLabel;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      container: true,
      liveRegion: true,
      child: Card.filled(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ExcludeSemantics(
                child: Icon(icon, color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: Spacing.sm),
              Text(title, style: theme.textTheme.titleMedium),
              if (message != null) ...[
                const SizedBox(height: Spacing.xs),
                Text(message!, style: theme.textTheme.bodyMedium),
              ],
              if (loading) ...[
                const SizedBox(height: Spacing.md),
                const ExcludeSemantics(
                  child: LinearProgressIndicator(minHeight: 2),
                ),
              ],
              if (onRetry != null) ...[
                const SizedBox(height: Spacing.sm),
                TextButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: Text(retryLabel!),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
