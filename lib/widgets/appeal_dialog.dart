// ignore_for_file: public_member_api_docs, deprecated_member_use

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/moderation/application/moderation_providers.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';

/// LYTHAUS APPEAL DIALOG
///
/// 🎯 Purpose: Allow users to appeal flagged/hidden content
/// ✅ Features: Appeal type selection, detailed reasoning, progress tracking
/// 🔐 Security: JWT authentication and validation
/// 📱 UX: Multi-step form with clear instructions and feedback

class AppealDialog extends ConsumerStatefulWidget {
  final String contentId;
  final String contentType;
  final String? contentPreview;
  final ModerationStatus currentStatus;

  const AppealDialog({
    super.key,
    required this.contentId,
    required this.contentType,
    this.contentPreview,
    required this.currentStatus,
  });

  @override
  ConsumerState<AppealDialog> createState() => _AppealDialogState();
}

class _AppealDialogState extends ConsumerState<AppealDialog> {
  final _formKey = GlobalKey<FormState>();
  final _statementController = TextEditingController();

  String _appealType = 'false_positive';
  String _appealReason = '';
  bool _isSubmitting = false;

  @override
  void dispose() {
    _statementController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Container(
        width: MediaQuery.of(context).size.width * 0.9,
        constraints: const BoxConstraints(maxWidth: 500, maxHeight: 700),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primaryContainer,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(12),
                  topRight: Radius.circular(12),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.gavel,
                    color: Theme.of(context).colorScheme.onPrimaryContainer,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Appeal Content Decision',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: Theme.of(context).colorScheme.onPrimaryContainer,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: Icon(
                      Icons.close,
                      color: Theme.of(context).colorScheme.onPrimaryContainer,
                    ),
                  ),
                ],
              ),
            ),

            // Content
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Current status info
                      _buildStatusInfo(),
                      const SizedBox(height: 20),

                      // Content preview (if available)
                      if (widget.contentPreview != null) _buildContentPreview(),

                      // Appeal type selection
                      _buildAppealTypeSelection(),
                      const SizedBox(height: 20),

                      // Appeal reason
                      _buildAppealReasonField(),
                      const SizedBox(height: 20),

                      // User statement
                      _buildUserStatementField(),
                      const SizedBox(height: 20),

                      // Appeal process info
                      _buildAppealProcessInfo(),
                    ],
                  ),
                ),
              ),
            ),

            // Actions
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: Theme.of(context).dividerColor),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: _isSubmitting
                        ? null
                        : () => Navigator.pop(context),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton(
                    onPressed: _isSubmitting ? null : _submitAppeal,
                    child: _isSubmitting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Submit Appeal'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusInfo() {
    String statusText;
    Color statusColor;
    IconData statusIcon;

    switch (widget.currentStatus) {
      case ModerationStatus.flagged:
        statusText = 'This content has been flagged by the community';
        statusColor = Colors.orange;
        statusIcon = Icons.flag;
        break;
      case ModerationStatus.hidden:
        statusText = 'This content has been hidden by moderators';
        statusColor = Colors.red;
        statusIcon = Icons.visibility_off;
        break;
      case ModerationStatus.communityRejected:
        statusText = 'This content was rejected by community vote';
        statusColor = Colors.red;
        statusIcon = Icons.cancel;
        break;
      default:
        statusText = 'Content is under review';
        statusColor = Colors.blue;
        statusIcon = Icons.hourglass_empty;
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: statusColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: statusColor.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(statusIcon, color: statusColor),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              statusText,
              style: TextStyle(color: statusColor, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContentPreview() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Content Preview:', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            widget.contentPreview!,
            style: Theme.of(context).textTheme.bodyMedium,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const SizedBox(height: 20),
      ],
    );
  }

  Widget _buildAppealTypeSelection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Why are you appealing this decision?',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 12),
        Column(
          children: AppealType.values
              .map(
                (type) => RadioListTile<String>(
                  title: Text(type.displayName),
                  subtitle: Text(
                    type.description,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  value: type.value,
                  groupValue: _appealType,
                  onChanged: (value) {
                    if (value == null) return;
                    setState(() {
                      _appealType = value;
                    });
                  },
                ),
              )
              .toList(),
        ),
      ],
    );
  }

  Widget _buildAppealReasonField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Appeal Reason', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        TextFormField(
          decoration: const InputDecoration(
            hintText: 'Briefly explain the reason for your appeal...',
            border: OutlineInputBorder(),
          ),
          maxLines: 2,
          validator: (value) {
            if (value == null || value.trim().isEmpty) {
              return 'Please provide a reason for your appeal';
            }
            if (value.trim().length < 10) {
              return 'Appeal reason must be at least 10 characters';
            }
            return null;
          },
          onChanged: (value) {
            _appealReason = value;
          },
        ),
      ],
    );
  }

  Widget _buildUserStatementField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Detailed Statement',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: _statementController,
          decoration: const InputDecoration(
            hintText:
                'Provide a detailed explanation of why you believe this decision should be reversed...',
            border: OutlineInputBorder(),
            alignLabelWithHint: true,
          ),
          maxLines: 5,
          maxLength: 1000,
          validator: (value) {
            if (value == null || value.trim().isEmpty) {
              return 'Please provide a detailed statement';
            }
            if (value.trim().length < 50) {
              return 'Statement must be at least 50 characters';
            }
            return null;
          },
        ),
      ],
    );
  }

  Widget _buildAppealProcessInfo() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.info_outline,
                size: 20,
                color: Theme.of(context).colorScheme.onSurface,
              ),
              const SizedBox(width: 8),
              Text(
                'Appeal Process',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '1. Your appeal will be reviewed by moderators first\n'
            '2. If rejected, eligible community members can vote\n'
            '3. Community voting requires 5+ votes or 5-minute timeout\n'
            '4. Majority approval (>50%) will restore your content\n'
            '5. You\'ll receive notifications about the decision',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _submitAppeal() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      final client = ref.read(moderationClientProvider);
      final token = await ref.read(jwtProvider.future);

      if (token == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Row(
                children: [
                  Icon(Icons.error, color: Colors.white),
                  SizedBox(width: 16),
                  Expanded(child: Text('User not authenticated')),
                ],
              ),
              backgroundColor: Colors.red,
              duration: Duration(seconds: 4),
            ),
          );
        }
        return;
      }

      final result = await client.submitAppeal(
        contentId: widget.contentId,
        contentType: widget.contentType,
        appealType: _appealType,
        appealReason: _appealReason,
        userStatement: _statementController.text,
        token: token,
      );

      if (mounted) {
        Navigator.pop(context, true);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.white),
                const SizedBox(width: 16),
                Expanded(
                  child: Text(
                    'Appeal submitted successfully - ID: ${result.appealId}',
                  ),
                ),
              ],
            ),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 4),
            action: SnackBarAction(
              label: 'View Status',
              textColor: Colors.white,
              onPressed: () {
                // Navigate to appeal history
                // This will be implemented when we create the appeal history page
              },
            ),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        String errorMessage = 'Failed to submit appeal';
        if (error is ModerationException) {
          final code = (error.code ?? '').toUpperCase();
          if (error.statusCode == 401) {
            errorMessage = 'Please log in to submit an appeal';
          } else if (error.statusCode == 409) {
            errorMessage =
                'You have already submitted an appeal for this content';
          } else if (error.statusCode == 429) {
            final payload = error.payload;
            final limit = payload?['limit'];
            final tier = payload?['tier'];
            if (code == 'DAILY_APPEAL_LIMIT_EXCEEDED') {
              if (limit is num && tier is String && tier.isNotEmpty) {
                errorMessage =
                    'You have reached your daily appeals limit (${limit.toInt()} for $tier tier). Please try again later.';
              } else {
                errorMessage =
                    'You have reached your daily appeals limit. Please try again tomorrow.';
              }
            } else {
              errorMessage =
                  'Too many appeal requests. Please wait before trying again.';
            }
          } else if (error.message.isNotEmpty) {
            errorMessage = error.message;
          }
        } else if (error is DioException) {
          if (error.response?.statusCode == 401) {
            errorMessage = 'Please log in to submit an appeal';
          } else if (error.response?.statusCode == 409) {
            errorMessage =
                'You have already submitted an appeal for this content';
          } else if (error.response?.statusCode == 429) {
            final data = error.response?.data;
            if (data is Map<String, dynamic> &&
                data['code'] == 'DAILY_APPEAL_LIMIT_EXCEEDED') {
              final limit = data['limit'] ?? 1;
              final tier = data['tier'] ?? 'free';
              errorMessage =
                  'You have reached your daily appeals limit ($limit for $tier tier). Please try again later.';
            } else {
              errorMessage =
                  'Too many appeal requests. Please wait before trying again.';
            }
          } else if (error.response?.data?['error'] != null) {
            final data = error.response!.data;
            if (data is Map<String, dynamic> && data['error'] is String) {
              errorMessage = data['error'] as String;
            }
          }
        } else {
          errorMessage = error.toString();
        }

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error, color: Colors.white),
                const SizedBox(width: 16),
                Expanded(child: Text(errorMessage)),
              ],
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }
}

/// Appeal types enum
enum AppealType {
  falsePositive(
    'false_positive',
    'False Positive',
    'The content was incorrectly flagged and doesn\'t violate guidelines',
  ),
  contextMissing(
    'context_missing',
    'Missing Context',
    'Important context was not considered in the moderation decision',
  ),
  other(
    'other',
    'Other Reason',
    'The decision was wrong for reasons not listed above',
  );

  const AppealType(this.value, this.displayName, this.description);

  final String value;
  final String displayName;
  final String description;
}

/// Helper function to show appeal dialog
Future<bool?> showAppealDialog({
  required BuildContext context,
  required String contentId,
  required String contentType,
  String? contentPreview,
  required ModerationStatus currentStatus,
}) {
  return showDialog<bool>(
    context: context,
    builder: (context) => AppealDialog(
      contentId: contentId,
      contentType: contentType,
      contentPreview: contentPreview,
      currentStatus: currentStatus,
    ),
  );
}
