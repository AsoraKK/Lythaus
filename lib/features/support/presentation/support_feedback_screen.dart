// ignore_for_file: public_member_api_docs

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/support/application/support_feedback_api.dart';
import 'package:lythaus/features/support/application/support_feedback_providers.dart';
import 'package:uuid/uuid.dart';

class SupportFeedbackScreen extends ConsumerStatefulWidget {
  const SupportFeedbackScreen({super.key});

  @override
  ConsumerState<SupportFeedbackScreen> createState() =>
      _SupportFeedbackScreenState();
}

class _SupportFeedbackScreenState extends ConsumerState<SupportFeedbackScreen> {
  static const _uuid = Uuid();
  static const _pageSize = 20;
  static const _labels = <String, String>{
    'problem': 'Report a problem',
    'suggestion': 'Feedback and suggestions',
  };

  final _title = TextEditingController();
  final _firstDetail = TextEditingController();
  final _secondDetail = TextEditingController();
  final _reproductionSteps = TextEditingController();
  final _reply = TextEditingController();
  Map<String, dynamic>? _options;
  String _kind = 'problem';
  String? _category;
  String? _submissionKey;
  String? _submissionSignature;
  String? _replyKey;
  String? _replySignature;
  List<Map<String, dynamic>> _history = <Map<String, dynamic>>[];
  String? _nextCursor;
  Map<String, dynamic>? _selectedRequest;
  Map<String, dynamic>? _detail;
  bool _loading = true;
  bool _loadingHistory = false;
  bool _loadingDetail = false;
  bool _busy = false;
  int _epoch = 0;
  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadInitial());
  }

  @override
  void dispose() {
    _title.dispose();
    _firstDetail.dispose();
    _secondDetail.dispose();
    _reproductionSteps.dispose();
    _reply.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<int>(authSessionRevisionProvider, (previous, next) {
      if (previous == next) return;
      _epoch += 1;
      setState(() {
        _options = null;
        _history = <Map<String, dynamic>>[];
        _nextCursor = null;
        _selectedRequest = null;
        _detail = null;
        _category = null;
        _error = null;
        _notice = null;
        _loading = true;
        _loadingHistory = false;
        _loadingDetail = false;
        _busy = false;
      });
      _clearForm();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _loadInitial();
      });
    });

    final categories = _categories;
    final selectedCategory = categories.contains(_category)
        ? _category
        : categories.isEmpty
        ? null
        : categories.first;
    final loading = _loading || _loadingHistory || _loadingDetail;

    return Scaffold(
      appBar: AppBar(title: const Text('Support and feedback')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            const Text(
              'These private requests are visible to you and Lythaus owners. '
              'They are not public posts.',
            ),
            const SizedBox(height: 16),
            SegmentedButton<String>(
              segments: const <ButtonSegment<String>>[
                ButtonSegment<String>(
                  value: 'problem',
                  label: Text('Report a problem'),
                  icon: Icon(Icons.bug_report_outlined),
                ),
                ButtonSegment<String>(
                  value: 'suggestion',
                  label: Text('Feedback and suggestions'),
                  icon: Icon(Icons.lightbulb_outline),
                ),
              ],
              selected: <String>{_kind},
              onSelectionChanged: _loading || _busy ? null : (selection) {
                if (selection.isEmpty || selection.single == _kind) return;
                _epoch += 1;
                ref.read(supportFeedbackClientProvider).cancelPending();
                setState(() {
                  _kind = selection.single;
                  _category = null;
                  _selectedRequest = null;
                  _detail = null;
                  _error = null;
                  _notice = null;
                });
                _clearForm();
                _loadHistory();
              },
            ),
            const SizedBox(height: 20),
            Text(_labels[_kind]!, style: Theme.of(context).textTheme.titleLarge),
            if (_options == null && _loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: CircularProgressIndicator()),
              )
            if (_options == null && !_loading)
              _UnavailableNotice(message: _error ?? _unavailableMessage),
            if (_options != null) ...<Widget>[
              DropdownButtonFormField<String>(
                key: ValueKey<String>('category-$_kind'),
                value: selectedCategory,
                decoration: const InputDecoration(labelText: 'Category'),
                items: categories
                    .map(
                      (value) => DropdownMenuItem<String>(
                        value: value,
                        child: Text(_readable(value)),
                      ),
                    )
                    .toList(growable: false),
                onChanged: categories.isEmpty
                    ? null
                    : (value) => setState(() => _category = value),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _title,
                decoration: const InputDecoration(
                  labelText: 'Title',
                  border: OutlineInputBorder(),
                ),
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 12),
              if (_kind == 'problem') ...<Widget>[
                TextField(
                  controller: _firstDetail,
                  decoration: const InputDecoration(
                    labelText: 'What happened?',
                    border: OutlineInputBorder(),
                  ),
                  minLines: 2,
                  maxLines: 5,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _secondDetail,
                  decoration: const InputDecoration(
                    labelText: 'What did you expect?',
                    border: OutlineInputBorder(),
                  ),
                  minLines: 2,
                  maxLines: 5,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _reproductionSteps,
                  decoration: const InputDecoration(
                    labelText: 'Steps to reproduce (optional)',
                    border: OutlineInputBorder(),
                  ),
                  minLines: 2,
                  maxLines: 5,
                ),
              ] else ...<Widget>[
                TextField(
                  controller: _firstDetail,
                  decoration: const InputDecoration(
                    labelText: 'What would you improve?',
                    border: OutlineInputBorder(),
                  ),
                  minLines: 2,
                  maxLines: 5,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _secondDetail,
                  decoration: const InputDecoration(
                    labelText: 'Who would this help, and how?',
                    border: OutlineInputBorder(),
                  ),
                  minLines: 2,
                  maxLines: 5,
                ),
              ],
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _busy || selectedCategory == null ? null : _submit,
                icon: const Icon(Icons.send_outlined),
                label: Text(_kind == 'problem' ? 'Send private report' : 'Send suggestion'),
              ),
              if (_busy)
                TextButton(
                  onPressed: _cancelPending,
                  child: const Text('Cancel sending'),
                ),
            ],
            if (_notice != null) ...<Widget>[
              const SizedBox(height: 8),
              Text(_notice!, key: const ValueKey<String>('support-notice')),
            ],
            if (_error != null && _options != null) ...<Widget>[
              const SizedBox(height: 8),
              _UnavailableNotice(message: _error!),
            ],
            const Divider(height: 32),
            Text('Your history', style: Theme.of(context).textTheme.titleLarge),
            Text(_kind == 'problem' ? 'Problem reports' : 'Suggestions'),
            if (_loadingHistory && _history.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_history.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text('No requests in this history yet.'),
              )
            else
              ..._history.map(_historyTile),
            if (_nextCursor != null)
              OutlinedButton(
                onPressed: _loadingHistory ? null : () => _loadHistory(append: true),
                child: Text(_loadingHistory ? 'Loading…' : 'Load more history'),
              ),
            if (_selectedRequest != null && _detail != null) ...<Widget>[
              const Divider(height: 32),
              _requestDetail(context),
            ],
            if (loading)
              TextButton(onPressed: _cancelPending, child: const Text('Cancel loading')),
          ],
        ),
      ),
    );
  }

  List<String> get _categories {
    final contract = _asMap(_options?['contract']);
    final all = _asMap(contract['categories']);
    final values = all[_kind];
    if (values is! List) return const <String>[];
    return values.whereType<String>().toList(growable: false);
  }

  Widget _historyTile(Map<String, dynamic> request) {
    final id = request['id'];
    final selected = id != null && id == _selectedRequest?['id'];
    return Card(
      child: ListTile(
        selected: selected,
        title: Text(_string(request['title'], 'Private request')),
        subtitle: Text(
          '${_readable(_string(request['state'], 'received'))} · '
          '${_readable(_string(request['category'], 'other'))}',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: id is String ? () => _loadDetail(request) : null,
      ),
    );
  }

  Widget _requestDetail(BuildContext context) {
    final request = _asMap(_detail?['request']);
    final rawMessages = _detail?['messages'];
    final messages = rawMessages is List
        ? rawMessages.map(_asMap).toList(growable: false)
        : const <Map<String, dynamic>>[];
    final id = request['id'];
    final revision = request['revision'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('Request details', style: Theme.of(context).textTheme.titleMedium),
        Text(_string(request['title'], 'Private request')),
        Text('Status: ${_readable(_string(request['state'], 'received'))}'),
        const SizedBox(height: 8),
        for (final message in messages)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(_string(message['from'], 'member') == 'owner' ? 'Lythaus' : 'You'),
            subtitle: Text(_string(message['text'], '')),
          ),
        if (_detail?['nextMessageCursor'] is int)
          TextButton(
            onPressed: _loadingDetail ? null : _loadOlderMessages,
            child: const Text('Load older messages'),
          ),
        TextField(
          controller: _reply,
          decoration: const InputDecoration(
            labelText: 'Reply privately',
            border: OutlineInputBorder(),
          ),
          minLines: 2,
          maxLines: 5,
        ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: _busy || id is! String || revision is! int ? null : _sendReply,
          child: const Text('Send reply'),
        ),
      ],
    );
  }

  Future<void> _loadInitial() async {
    final epoch = ++_epoch;
    final client = ref.read(supportFeedbackClientProvider);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait(<Future<Map<String, dynamic>>>[
        client.getOptions(),
        client.list(kind: _kind, limit: _pageSize),
      ]);
      if (!_current(client, epoch)) return;
      final items = _maps(results[1]['items']);
      setState(() {
        _options = results[0];
        _history = items;
        _nextCursor = _nullableString(results[1]['nextCursor']);
        _loading = false;
        _loadingHistory = false;
        _error = null;
      });
    } on SupportFeedbackCancelled {
      if (_current(client, epoch)) setState(() => _loading = false);
    } catch (error) {
      if (!_current(client, epoch)) return;
      setState(() {
        _loading = false;
        _loadingHistory = false;
        _error = _safeError(error);
      });
    }
  }

  Future<void> _loadHistory({bool append = false}) async {
    final client = ref.read(supportFeedbackClientProvider);
    final epoch = _epoch;
    setState(() {
      _loadingHistory = true;
      _error = null;
    });
    try {
      final result = await client.list(
        kind: _kind,
        limit: _pageSize,
        cursor: append ? _nextCursor : null,
      );
      if (!_current(client, epoch)) return;
      final items = _maps(result['items']);
      setState(() {
        _history = append ? <Map<String, dynamic>>[..._history, ...items] : items;
        _nextCursor = _nullableString(result['nextCursor']);
        _loadingHistory = false;
      });
    } on SupportFeedbackCancelled {
      if (_current(client, epoch)) setState(() => _loadingHistory = false);
    } catch (error) {
      if (!_current(client, epoch)) return;
      setState(() {
        _loadingHistory = false;
        _error = _safeError(error);
      });
    }
  }

  Future<void> _loadDetail(Map<String, dynamic> request) async {
    final id = request['id'];
    if (id is! String) return;
    final client = ref.read(supportFeedbackClientProvider);
    final epoch = _epoch;
    setState(() {
      _selectedRequest = request;
      _detail = null;
      _loadingDetail = true;
      _error = null;
    });
    try {
      final result = await client.detail(kind: _kind, requestId: id);
      if (!_current(client, epoch)) return;
      final messages = _maps(result['messages'])
        ..sort((left, right) => (left['revision'] as int).compareTo(right['revision'] as int));
      setState(() {
        _detail = <String, dynamic>{...result, 'messages': messages};
        _selectedRequest = _asMap(result['request']);
        _loadingDetail = false;
        _reply.clear();
        _replyKey = null;
        _replySignature = null;
      });
    } on SupportFeedbackCancelled {
      if (_current(client, epoch)) setState(() => _loadingDetail = false);
    } catch (error) {
      if (!_current(client, epoch)) return;
      setState(() {
        _loadingDetail = false;
        _error = _safeError(error);
      });
    }
  }

  Future<void> _loadOlderMessages() async {
    final request = _asMap(_detail?['request']);
    final id = request['id'];
    final cursor = _detail?['nextMessageCursor'];
    if (id is! String || cursor is! int) return;
    final client = ref.read(supportFeedbackClientProvider);
    final epoch = _epoch;
    setState(() => _loadingDetail = true);
    try {
      final older = await client.detail(
        kind: _kind,
        requestId: id,
        messageBefore: cursor,
      );
      if (!_current(client, epoch)) return;
      final currentMessages = _maps(_detail?['messages']);
      final olderMessages = _maps(older['messages']);
      currentMessages.sort((left, right) => (left['revision'] as int).compareTo(right['revision'] as int));
      olderMessages.sort((left, right) => (left['revision'] as int).compareTo(right['revision'] as int));
      setState(() {
        _detail = <String, dynamic>{
          ..._detail!,
          'messages': <Map<String, dynamic>>[...olderMessages, ...currentMessages],
          'nextMessageCursor': older['nextMessageCursor'],
        };
        _loadingDetail = false;
      });
    } on SupportFeedbackCancelled {
      if (_current(client, epoch)) setState(() => _loadingDetail = false);
    } catch (error) {
      if (!_current(client, epoch)) return;
      setState(() {
        _loadingDetail = false;
        _error = _safeError(error);
      });
    }
  }

  Future<void> _submit() async {
    final category = _categoryForSubmit;
    if (category == null) return;
    final first = _firstDetail.text.trim();
    final second = _secondDetail.text.trim();
    final title = _title.text.trim();
    if (title.isEmpty || first.isEmpty || second.isEmpty) {
      setState(() => _error = 'Complete the required fields before sending.');
      return;
    }
    final body = <String, dynamic>{
      'category': category,
      'title': title,
      if (_kind == 'problem') ...<String, dynamic>{
        'actual': first,
        'expected': second,
        if (_reproductionSteps.text.trim().isNotEmpty)
          'reproductionSteps': _reproductionSteps.text.trim(),
      } else ...<String, dynamic>{
        'improvement': first,
        'benefit': second,
      },
    };
    final signature = jsonEncode(body);
    if (_submissionKey == null || _submissionSignature != signature) {
      _submissionKey = _uuid.v4();
      _submissionSignature = signature;
    }
    final client = ref.read(supportFeedbackClientProvider);
    final epoch = _epoch;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final result = await client.submit(
        kind: _kind,
        body: body,
        idempotencyKey: _submissionKey!,
      );
      if (!_current(client, epoch)) return;
      final request = _asMap(result['request']);
      setState(() {
        _busy = false;
        _selectedRequest = request;
        _notice = 'Your private request was received.';
        _submissionKey = null;
        _submissionSignature = null;
      });
      _clearForm();
      await _loadHistory();
      if (request['id'] is String) await _loadDetail(request);
    } on SupportFeedbackCancelled {
      if (_current(client, epoch)) {
        setState(() {
          _busy = false;
          _notice = 'Sending stopped. Check your history before trying again.';
        });
      }
    } catch (error) {
      if (!_current(client, epoch)) return;
      setState(() {
        _busy = false;
        _error = _safeError(error);
      });
    }
  }

  Future<void> _sendReply() async {
    final request = _asMap(_detail?['request']);
    final id = request['id'];
    final revision = request['revision'];
    final message = _reply.text.trim();
    if (id is! String || revision is! int || message.isEmpty) {
      setState(() => _error = 'Write a reply before sending.');
      return;
    }
    final signature = '$id:$revision:$message';
    if (_replyKey == null || _replySignature != signature) {
      _replyKey = _uuid.v4();
      _replySignature = signature;
    }
    final client = ref.read(supportFeedbackClientProvider);
    final epoch = _epoch;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await client.reply(
        kind: _kind,
        requestId: id,
        expectedRevision: revision,
        message: message,
        idempotencyKey: _replyKey!,
      );
      if (!_current(client, epoch)) return;
      setState(() {
        _busy = false;
        _notice = 'Your reply was added to the private history.';
        _replyKey = null;
        _replySignature = null;
        _reply.clear();
      });
      await _loadHistory();
      await _loadDetail(request);
    } on SupportFeedbackCancelled {
      if (_current(client, epoch)) {
        setState(() {
          _busy = false;
          _notice = 'Sending stopped. Check this history before trying again.';
        });
      }
    } catch (error) {
      if (!_current(client, epoch)) return;
      setState(() {
        _busy = false;
        _error = _safeError(error);
      });
    }
  }

  void _cancelPending() {
    ref.read(supportFeedbackClientProvider).cancelPending();
  }

  void _clearForm() {
    _title.clear();
    _firstDetail.clear();
    _secondDetail.clear();
    _reproductionSteps.clear();
    _reply.clear();
    _submissionKey = null;
    _submissionSignature = null;
    _replyKey = null;
    _replySignature = null;
  }

  bool _current(SupportFeedbackClient client, int epoch) =>
      mounted && epoch == _epoch && client.isCurrentSession;

  String? get _categoryForSubmit {
    final categories = _categories;
    if (categories.isEmpty) return null;
    return categories.contains(_category) ? _category : categories.first;
  }

  static Map<String, dynamic> _asMap(Object? value) =>
      value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

  static List<Map<String, dynamic>> _maps(Object? value) =>
      value is List ? value.map(_asMap).where((item) => item.isNotEmpty).toList() : <Map<String, dynamic>>[];

  static String? _nullableString(Object? value) => value is String && value.isNotEmpty ? value : null;

  static String _string(Object? value, String fallback) => value is String ? value : fallback;

  static String _readable(String value) => value.replaceAll('_', ' ').replaceAll('-', ' ');

  static const _unavailableMessage =
      'Support is not available right now. Your account and privacy settings still work as usual.';

  static String _safeError(Object error) {
    if (error is SupportFeedbackApiException) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        return 'Sign in to send or view private requests.';
      }
      if (error.statusCode == 409) {
        return 'This request changed or is closed. Reload its history before replying.';
      }
      if (error.statusCode == 429) {
        return 'Support actions are temporarily limited. Try again later.';
      }
    }
    return _unavailableMessage;
  }
}

class _UnavailableNotice extends StatelessWidget {
  const _UnavailableNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Text(message, key: const ValueKey<String>('support-unavailable')),
  );
}
