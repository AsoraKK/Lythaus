// ignore_for_file: public_member_api_docs

// ignore_for_file: deprecated_member_use

import 'package:flutter/material.dart';

import 'package:lythaus/features/moderation/domain/moderation_decision.dart';

class ModerationDecisionPanel extends StatefulWidget {
  const ModerationDecisionPanel({
    super.key,
    required this.onSubmit,
    this.isSubmitting = false,
  });

  final ValueChanged<ModerationDecisionInput> onSubmit;
  final bool isSubmitting;

  @override
  State<ModerationDecisionPanel> createState() =>
      _ModerationDecisionPanelState();
}

class _ModerationDecisionPanelState extends State<ModerationDecisionPanel> {
  final _formKey = GlobalKey<FormState>();
  final _rationaleController = TextEditingController();
  ModerationDecisionAction _selectedAction = ModerationDecisionAction.remove;
  bool _policyTest = false;

  @override
  void dispose() {
    _rationaleController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() != true) {
      return;
    }
    final input = ModerationDecisionInput(
      action: _selectedAction,
      rationale: _rationaleController.text.trim(),
      policyTest: _policyTest,
    );
    widget.onSubmit(input);
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Moderator decision',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            ...ModerationDecisionAction.values.map((action) {
              return InkWell(
                onTap: widget.isSubmitting
                    ? null
                    : () {
                        setState(() => _selectedAction = action);
                      },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8.0),
                  child: Row(
                    children: [
                      Radio<ModerationDecisionAction>(
                        value: action,
                        groupValue: _selectedAction,
                        onChanged: widget.isSubmitting
                            ? null
                            : (value) {
                                if (value != null) {
                                  setState(() => _selectedAction = value);
                                }
                              },
                      ),
                      Expanded(child: Text(action.label)),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 12),
            Form(
              key: _formKey,
              child: TextFormField(
                controller: _rationaleController,
                maxLines: 4,
                minLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Decision rationale',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().length < 8) {
                    return 'Provide at least 8 characters of rationale.';
                  }
                  return null;
                },
                enabled: !widget.isSubmitting,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Mark as policy test'),
                Switch.adaptive(
                  value: _policyTest,
                  onChanged: widget.isSubmitting
                      ? null
                      : (value) {
                          setState(() => _policyTest = value);
                        },
                ),
              ],
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: widget.isSubmitting ? null : _submit,
              child: widget.isSubmitting
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Submit decision'),
            ),
          ],
        ),
      ),
    );
  }
}
