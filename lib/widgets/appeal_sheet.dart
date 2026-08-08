// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/design_system/components/lyth_text_field.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/services/appeal_provider.dart';

class AppealSheet extends ConsumerStatefulWidget {
  final String postId;
  const AppealSheet({super.key, required this.postId});
  @override
  ConsumerState<AppealSheet> createState() => _AppealSheetState();
}

class _AppealSheetState extends ConsumerState<AppealSheet> {
  final _ctrl = TextEditingController();
  bool _loading = false;
  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: context.spacing.lg,
        right: context.spacing.lg,
        top: context.spacing.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Appeal decision',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          SizedBox(height: context.spacing.sm),
          LythTextField(
            controller: _ctrl,
            maxLines: 5,
            placeholder: 'Explain why this was a mistake',
          ),
          SizedBox(height: context.spacing.md),
          LythButton.primary(
            label: _loading ? 'Submitting...' : 'Submit',
            onPressed: _loading
                ? null
                : () async {
                    setState(() => _loading = true);
                    final ok = await ref
                        .read(appealProvider)
                        .submit(widget.postId, _ctrl.text);
                    setState(() => _loading = false);
                    if (!context.mounted) return;
                    Navigator.pop(context);
                    if (ok) {
                      LythSnackbar.success(
                        context: context,
                        message: 'Appeal submitted',
                      );
                    } else {
                      LythSnackbar.error(
                        context: context,
                        message: 'Failed to submit appeal',
                      );
                    }
                  },
            isLoading: _loading,
          ),
          SizedBox(height: context.spacing.md),
        ],
      ),
    );
  }
}
