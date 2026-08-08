// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_text_field.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Dialog that requires users to type DELETE before confirming.
class DeleteConfirmationDialog extends StatefulWidget {
  const DeleteConfirmationDialog({super.key});

  @override
  State<DeleteConfirmationDialog> createState() =>
      _DeleteConfirmationDialogState();
}

class _DeleteConfirmationDialogState extends State<DeleteConfirmationDialog> {
  final _controller = TextEditingController();
  bool _canConfirm = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_handleChanged);
  }

  @override
  void dispose() {
    _controller.removeListener(_handleChanged);
    _controller.dispose();
    super.dispose();
  }

  void _handleChanged() {
    final matches = _controller.text.trim().toUpperCase() == 'DELETE';
    if (matches != _canConfirm) {
      setState(() => _canConfirm = matches);
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final spacing = context.spacing;

    return AlertDialog(
      title: const Text('Delete account'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'This removes your profile and content. This action cannot be undone.',
          ),
          SizedBox(height: spacing.lg),
          Text(
            'Type DELETE to confirm',
            style: textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          SizedBox(height: spacing.sm),
          LythTextField(
            label: null,
            placeholder: 'DELETE',
            controller: _controller,
            onChanged: (_) => _handleChanged(),
          ),
        ],
      ),
      actions: [
        LythButton.secondary(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(false),
        ),
        LythButton(
          label: 'Delete',
          variant: LythButtonVariant.destructive,
          onPressed: _canConfirm ? () => Navigator.of(context).pop(true) : null,
          disabled: !_canConfirm,
        ),
      ],
    );
  }
}
