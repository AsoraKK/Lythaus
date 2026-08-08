// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';
import 'package:lythaus/widgets/appeal_dialog.dart';

class ReceiptDrawer {
  static Future<void> show(BuildContext context, String postId) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => SizedBox(
        height: MediaQuery.of(context).size.height * 0.82,
        child: ReceiptDrawerSheet(postId: postId),
      ),
    );
  }
}

class ReceiptDrawerSheet extends ConsumerStatefulWidget {
  const ReceiptDrawerSheet({super.key, required this.postId});

  final String postId;

  @override
  ConsumerState<ReceiptDrawerSheet> createState() => _ReceiptDrawerSheetState();
}

class _ReceiptDrawerSheetState extends ConsumerState<ReceiptDrawerSheet> {
  late Future<_ReceiptPayload> _future;

  @override
  void initState() {
    super.initState();
    _future = _loadReceipt();
  }

  Future<_ReceiptPayload> _loadReceipt() async {
    final dio = ref.read(secureDioProvider);
    final response = await dio.get<Map<String, dynamic>>(
      '/api/posts/${widget.postId}/receipt',
    );
    final data = response.data ?? const <String, dynamic>{};
    final eventsJson = data['events'];
    final events = eventsJson is List
        ? eventsJson
              .whereType<Map<String, dynamic>>()
              .map(
                (raw) => _ReceiptEvent.fromJson(Map<String, dynamic>.from(raw)),
              )
              .toList()
        : const <_ReceiptEvent>[];

    return _ReceiptPayload(
      postId: data['postId'] as String? ?? widget.postId,
      events: events,
      issuedAt: data['issuedAt'] as String? ?? '',
      signature: data['signature'] as String? ?? '',
      keyId: data['keyId'] as String? ?? '',
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_ReceiptPayload>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const _ReceiptLoading();
        }
        if (snapshot.hasError) {
          return _ReceiptError(
            onRetry: () => setState(() {
              _future = _loadReceipt();
            }),
          );
        }
        final payload = snapshot.data;
        if (payload == null) {
          return _ReceiptError(
            message: 'Receipt unavailable',
            onRetry: () => setState(() {
              _future = _loadReceipt();
            }),
          );
        }
        return _ReceiptContent(payload: payload);
      },
    );
  }
}

class _ReceiptContent extends StatelessWidget {
  const _ReceiptContent({required this.payload});

  final _ReceiptPayload payload;

  @override
  Widget build(BuildContext context) {
    final hasAppealEvent = payload.events.any(
      (event) =>
          event.type == 'APPEAL_OPENED' || event.type == 'APPEAL_RESOLVED',
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
          child: Row(
            children: [
              Text(
                'Post Receipt',
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        ),
        if (payload.events.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Text('No receipt events yet.'),
          )
        else
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              itemCount: payload.events.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final event = payload.events[index];
                return _ReceiptEventTile(
                  event: event,
                  postId: payload.postId,
                  allowAppealAction: !hasAppealEvent,
                );
              },
            ),
          ),
      ],
    );
  }
}

class _ReceiptEventTile extends StatelessWidget {
  const _ReceiptEventTile({
    required this.event,
    required this.postId,
    required this.allowAppealAction,
  });

  final _ReceiptEvent event;
  final String postId;
  final bool allowAppealAction;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.outlineVariant),
        color: scheme.surfaceContainerLowest,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            event.summary,
            style: Theme.of(
              context,
            ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(event.reason, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final action in event.actions)
                if (action.key == 'APPEAL' &&
                    action.enabled &&
                    allowAppealAction)
                  OutlinedButton.icon(
                    onPressed: () => showAppealDialog(
                      context: context,
                      contentId: postId,
                      contentType: 'post',
                      currentStatus: ModerationStatus.hidden,
                    ),
                    icon: const Icon(Icons.gavel_outlined, size: 16),
                    label: Text(action.label),
                  )
                else if (action.key == 'LEARN_MORE')
                  TextButton.icon(
                    onPressed: event.policyLinks.isNotEmpty
                        ? () => _launchUrl(event.policyLinks.first.url)
                        : null,
                    icon: const Icon(Icons.open_in_new, size: 16),
                    label: Text(action.label),
                  ),
            ],
          ),
          if (event.policyLinks.isNotEmpty) ...[
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: event.policyLinks
                  .map(
                    (link) => InkWell(
                      onTap: () => _launchUrl(link.url),
                      child: Text(
                        link.title,
                        style: Theme.of(context).textTheme.labelMedium
                            ?.copyWith(
                              color: scheme.primary,
                              decoration: TextDecoration.underline,
                            ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Event ID: ${event.id}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ),
              IconButton(
                tooltip: 'Copy event ID',
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: event.id));
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Event ID copied')),
                    );
                  }
                },
                icon: const Icon(Icons.copy, size: 16),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _launchUrl(String raw) async {
    final uri = Uri.tryParse(raw);
    if (uri == null) {
      return;
    }
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

class _ReceiptLoading extends StatelessWidget {
  const _ReceiptLoading();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.all(20),
      child: Center(child: CircularProgressIndicator()),
    );
  }
}

class _ReceiptError extends StatelessWidget {
  const _ReceiptError({
    this.message = 'Receipt unavailable',
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message),
            const SizedBox(height: 8),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

class _ReceiptPayload {
  const _ReceiptPayload({
    required this.postId,
    required this.events,
    required this.issuedAt,
    required this.signature,
    required this.keyId,
  });

  final String postId;
  final List<_ReceiptEvent> events;
  final String issuedAt;
  final String signature;
  final String keyId;
}

class _ReceiptEvent {
  const _ReceiptEvent({
    required this.id,
    required this.type,
    required this.summary,
    required this.reason,
    required this.policyLinks,
    required this.actions,
  });

  final String id;
  final String type;
  final String summary;
  final String reason;
  final List<_ReceiptPolicyLink> policyLinks;
  final List<_ReceiptAction> actions;

  factory _ReceiptEvent.fromJson(Map<String, dynamic> json) {
    final links = json['policyLinks'];
    final actions = json['actions'];

    return _ReceiptEvent(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? '',
      summary: json['summary'] as String? ?? 'Event recorded',
      reason:
          json['reason'] as String? ??
          'This action was recorded for transparency.',
      policyLinks: links is List
          ? links
                .whereType<Map<String, dynamic>>()
                .map(
                  (item) => _ReceiptPolicyLink.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList()
          : const <_ReceiptPolicyLink>[],
      actions: actions is List
          ? actions
                .whereType<Map<String, dynamic>>()
                .map(
                  (item) =>
                      _ReceiptAction.fromJson(Map<String, dynamic>.from(item)),
                )
                .toList()
          : const <_ReceiptAction>[],
    );
  }
}

class _ReceiptPolicyLink {
  const _ReceiptPolicyLink({required this.title, required this.url});

  final String title;
  final String url;

  factory _ReceiptPolicyLink.fromJson(Map<String, dynamic> json) {
    return _ReceiptPolicyLink(
      title: json['title'] as String? ?? 'Policy',
      url: json['url'] as String? ?? '',
    );
  }
}

class _ReceiptAction {
  const _ReceiptAction({
    required this.key,
    required this.label,
    required this.enabled,
  });

  final String key;
  final String label;
  final bool enabled;

  factory _ReceiptAction.fromJson(Map<String, dynamic> json) {
    return _ReceiptAction(
      key: json['key'] as String? ?? 'LEARN_MORE',
      label: json['label'] as String? ?? 'Learn more',
      enabled: json['enabled'] as bool? ?? false,
    );
  }
}
