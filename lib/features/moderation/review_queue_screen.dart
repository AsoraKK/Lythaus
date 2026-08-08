// ignore_for_file: public_member_api_docs

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:lythaus/features/moderation/moderation_service.dart';

class ReviewQueueScreen extends StatefulWidget {
  final String baseUrl;
  final String accessToken;
  final Map<String, dynamic> userClaims; // should include 'role'
  final bool autoLoad; // allow tests to disable initial network fetch
  final ModerationService? service; // injectable for tests

  const ReviewQueueScreen({
    super.key,
    required this.baseUrl,
    required this.accessToken,
    required this.userClaims,
    this.autoLoad = true,
    this.service,
  });

  @override
  State<ReviewQueueScreen> createState() => _ReviewQueueScreenState();
}

class _ReviewQueueScreenState extends State<ReviewQueueScreen> {
  late final ModerationService _svc;
  final ScrollController _scroll = ScrollController();
  final List<dynamic> _items = [];
  bool _loading = false;
  bool _hasMore = true;
  int _page = 1;
  String _status = 'pending';

  bool get _authorized {
    final role = widget.userClaims['role']?.toString().toLowerCase();
    return role == 'admin' || role == 'moderator';
  }

  @override
  void initState() {
    super.initState();
    _svc =
        widget.service ??
        ModerationService(widget.baseUrl, httpClient: http.Client());
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 200 &&
          !_loading &&
          _hasMore) {
        _loadMore();
      }
    });
    if (widget.autoLoad) {
      _refresh();
    }
  }

  Future<void> _refresh() async {
    setState(() {
      _items.clear();
      _page = 1;
      _hasMore = true;
    });
    await _loadMore();
  }

  Future<void> _loadMore() async {
    if (!_authorized) return;
    setState(() {
      _loading = true;
    });
    try {
      final data = await _svc.fetchReviewQueue(
        accessToken: widget.accessToken,
        page: _page,
        pageSize: 20,
        status: _status,
      );
      final list = (data['items'] as List?) ?? (data['appeals'] as List? ?? []);
      setState(() {
        _items.addAll(list);
        _hasMore = list.length == 20;
        _page += 1;
      });
    } finally {
      setState(() {
        _loading = false;
      });
    }
  }

  Future<void> _action(String id, String action) async {
    // Optimistic update: remove item locally
    final idx = _items.indexWhere((e) => (e['id'] ?? e['appealId']) == id);
    final removed = idx >= 0 ? _items.removeAt(idx) : null;
    setState(() {});
    try {
      switch (action) {
        case 'approve':
          await _svc.approve(widget.accessToken, id);
          break;
        case 'reject':
          await _svc.reject(widget.accessToken, id);
          break;
        case 'escalate':
          await _svc.escalate(widget.accessToken, id);
          break;
      }
    } catch (_) {
      if (removed != null) {
        _items.insert(idx, removed);
        setState(() {});
      }
      rethrow;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_authorized) {
      return const Scaffold(
        body: Center(child: Text('Insufficient permissions.')),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Moderation Queue', key: Key('moderation-title')),
        actions: [
          DropdownButton<String>(
            value: _status,
            underline: const SizedBox.shrink(),
            items: const [
              DropdownMenuItem(value: 'pending', child: Text('Pending')),
              DropdownMenuItem(value: 'escalated', child: Text('Escalated')),
              DropdownMenuItem(value: 'all', child: Text('All')),
            ],
            onChanged: (v) {
              if (v != null) {
                setState(() => _status = v);
                _refresh();
              }
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: _items.isEmpty && !_loading
            ? const ListEmptyState()
            : ListView.builder(
                controller: _scroll,
                itemCount: _items.length + (_loading ? 1 : 0),
                itemBuilder: (context, index) {
                  if (index >= _items.length) {
                    return const Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  final item = _items[index] as Map<String, dynamic>;
                  final id = (item['id'] ?? item['appealId']).toString();
                  final title =
                      item['title']?.toString() ??
                      item['contentId']?.toString() ??
                      id;
                  final reason =
                      item['reason']?.toString() ??
                      item['status']?.toString() ??
                      '';
                  return Card(
                    child: ListTile(
                      title: Text(title),
                      subtitle: Text(reason),
                      trailing: Wrap(
                        spacing: 6,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.check),
                            onPressed: () => _action(id, 'approve'),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => _action(id, 'reject'),
                          ),
                          IconButton(
                            icon: const Icon(Icons.outbound),
                            onPressed: () => _action(id, 'escalate'),
                          ),
                        ],
                      ),
                      onTap: () => showDialog<void>(
                        context: context,
                        builder: (_) => _DetailDialog(item: item),
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class ListEmptyState extends StatelessWidget {
  const ListEmptyState({super.key});
  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('No items in review queue.'));
  }
}

class _DetailDialog extends StatelessWidget {
  final Map<String, dynamic> item;
  const _DetailDialog({required this.item});
  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
        item['title']?.toString() ?? (item['id']?.toString() ?? 'Detail'),
      ),
      content: SingleChildScrollView(
        child: Text(const JsonEncoder.withIndent('  ').convert(item)),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
