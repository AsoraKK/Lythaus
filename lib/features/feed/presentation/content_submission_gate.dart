import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';

/// Keeps presentation draft-only until the publishing contract is reconciled.
final contentSubmissionPresentationEnabledProvider = Provider<bool>(
  (ref) => false,
);

/// Explains the unavailable submission action without promising a saved draft.
const contentSubmissionUnavailableMessage =
    'Posting and edits are unavailable while publication checks are being '
    'validated. You can keep a private draft on this device.';

/// Preserves uncertainty when an older request cannot currently be retried.
const contentSubmissionPendingMessage =
    'A previous submission is awaiting confirmation. Its saved details are '
    'retained and will not be retried while posting is unavailable.';

/// The approved presentation copy, separate from the pending server contract.
const contentPostingPolicyMessage =
    'AI-generated or AI-edited media are not permitted.\n'
    'AI-generated text may contain up to 250 characters.\n'
    'Ordinary text may contain up to 5,000 characters.\n'
    'Posting remains unavailable while publication checks are being validated.';

/// Validates ordinary draft size without inferring a creation declaration.
String? contentDraftValidationError(String text) =>
    text.length > postTextMaxLength
    ? 'Text cannot exceed $postTextMaxLength characters.'
    : null;

/// Opens the posting rules without exposing an authorship selector.
Future<void> showContentPostingPolicy(BuildContext context) => showDialog<void>(
  context: context,
  builder: (dialogContext) => AlertDialog(
    scrollable: true,
    title: const Text('Posting policy'),
    content: const Text(contentPostingPolicyMessage),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(dialogContext).pop(),
        child: const Text('Done'),
      ),
    ],
  ),
);
