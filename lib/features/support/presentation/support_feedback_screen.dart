// ignore_for_file: public_member_api_docs

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/support/application/support_feedback_api.dart';
import 'package:lythaus/features/support/application/support_feedback_providers.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:uuid/uuid.dart';

class SupportFeedbackScreen extends ConsumerStatefulWidget {
  const SupportFeedbackScreen({super.key, this.initialKind = 'problem'})
    : assert(initialKind == 'problem' || initialKind == 'suggestion');

  final String initialKind;

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
  late String _kind;
  String? _category;
  String? _submissionKey;
  String? _submissionSignature;
  String? _replyKey;
  String? _replySignature;
  String? _replyRequestId;
  String? _pendingReplyRequestId;
  int _replyDraftVersion = 0;
  List<Map<String, dynamic>> _history = <Map<String, dynamic>>[];
  String? _nextCursor;
  Map<String, dynamic>? _selectedRequest;
  Map<String, dynamic>? _detail;
  bool _loading = true;
  bool _loadingHistory = false;
  bool _loadingDetail = false;
  bool _busy = false;
  bool _allowPop = false;
  bool _confirmingLeave = false;
  bool _confirmingKindChange = false;
  int _epoch = 0;
  int _detailGeneration = 0;
  String? _error;
  String? _historyError;
  String? _detailError;
  bool _detailErrorIsOlder = false;
  String? _notice;
  String? _pendingMessage;

  @override
  void initState() {
    super.initState();
    _kind = widget.initialKind;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _loadInitial();
    });
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
    ref.watch(supportFeedbackClientProvider);
    ref.listen<int>(authSessionRevisionProvider, (previous, next) {
      if (previous == next) return;
      _epoch += 1;
      _detailGeneration += 1;
      setState(() {
        _options = null;
        _history = <Map<String, dynamic>>[];
        _nextCursor = null;
        _selectedRequest = null;
        _detail = null;
        _category = null;
        _error = null;
        _historyError = null;
        _detailError = null;
        _detailErrorIsOlder = false;
        _notice = null;
        _pendingMessage = null;
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

    final page = Scaffold(
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
            LayoutBuilder(
              builder: (context, constraints) => SegmentedButton<String>(
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
                direction:
                    constraints.maxWidth < 520 ||
                        MediaQuery.textScalerOf(context).scale(1) > 1.25
                    ? Axis.vertical
                    : Axis.horizontal,
                selected: <String>{_kind},
                onSelectionChanged: _loading || _busy || _confirmingKindChange
                    ? null
                    : (selection) {
                        if (selection.isEmpty || selection.single == _kind) {
                          return;
                        }
                        if (_hasDraft) {
                          _confirmKindChange(selection.single);
                        } else {
                          _switchKind(selection.single);
                        }
                      },
              ),
            ),
            const SizedBox(height: 20),
            Text(
              _labels[_kind]!,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if (_options == null && _loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(
                  child: CircularProgressIndicator(
                    semanticsLabel: 'Loading support options',
                  ),
                ),
              ),
            if (_options == null && !_loading) ...<Widget>[
              _UnavailableNotice(message: _error ?? _unavailableMessage),
              TextButton.icon(
                onPressed: _loading ? null : _loadInitial,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry support'),
              ),
            ],
            if (_options != null && categories.isEmpty)
              const _UnavailableNotice(
                message: 'This request type is not available right now.',
              ),
            if (_options != null && categories.isNotEmpty) ...<Widget>[
              DropdownButtonFormField<String>(
                key: ValueKey<String>('category-$_kind'),
                initialValue: selectedCategory,
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
                decoration: InputDecoration(
                  labelText: 'Title',
                  border: const OutlineInputBorder(),
                  helperText: _characterHint('titleCharacters'),
                ),
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 12),
              if (_kind == 'problem') ...<Widget>[
                TextField(
                  controller: _firstDetail,
                  decoration: InputDecoration(
                    labelText: 'What happened?',
                    border: const OutlineInputBorder(),
                    helperText: _characterHint('detailCharacters'),
                  ),
                  minLines: 2,
                  maxLines: 5,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _secondDetail,
                  decoration: InputDecoration(
                    labelText: 'What did you expect?',
                    border: const OutlineInputBorder(),
                    helperText: _characterHint('detailCharacters'),
                  ),
                  minLines: 2,
                  maxLines: 5,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _reproductionSteps,
                  decoration: InputDecoration(
                    labelText: 'Steps to reproduce (optional)',
                    border: const OutlineInputBorder(),
                    helperText: _characterHint('stepsCharacters'),
                  ),
                  minLines: 2,
                  maxLines: 5,
                ),
              ] else ...<Widget>[
                TextField(
                  controller: _firstDetail,
                  decoration: InputDecoration(
                    labelText: 'What would you improve?',
                    border: const OutlineInputBorder(),
                    helperText: _characterHint('detailCharacters'),
                  ),
                  minLines: 2,
                  maxLines: 5,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _secondDetail,
                  decoration: InputDecoration(
                    labelText: 'Who would this help, and how?',
                    border: const OutlineInputBorder(),
                    helperText: _characterHint('detailCharacters'),
                  ),
                  minLines: 2,
                  maxLines: 5,
                ),
              ],
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _busy || selectedCategory == null ? null : _submit,
                icon: const Icon(Icons.send_outlined),
                label: Text(
                  _kind == 'problem'
                      ? 'Send private report'
                      : 'Send suggestion',
                ),
              ),
              if (_busy)
                Semantics(
                  liveRegion: true,
                  child: Text(_pendingMessage ?? 'Sending privately…'),
                ),
              if (_busy)
                TextButton(
                  onPressed: _cancelPending,
                  child: const Text('Cancel sending'),
                ),
            ],
            if (_notice != null) ...<Widget>[
              const SizedBox(height: 8),
              Semantics(
                liveRegion: true,
                child: Text(
                  _notice!,
                  key: const ValueKey<String>('support-notice'),
                ),
              ),
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
                child: Center(
                  child: CircularProgressIndicator(
                    semanticsLabel: 'Loading private request history',
                  ),
                ),
              )
            else if (_historyError != null && _history.isEmpty) ...<Widget>[
              _UnavailableNotice(message: _historyError!),
              TextButton.icon(
                onPressed: _loadingHistory ? null : _loadHistory,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry history'),
              ),
            ] else if (_history.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text('No requests in this history yet.'),
              )
            else
              ..._history.map(_historyTile),
            if (_historyError != null && _history.isNotEmpty)
              _UnavailableNotice(message: _historyError!),
            if (_nextCursor != null)
              OutlinedButton(
                onPressed: _loadingHistory
                    ? null
                    : () => _loadHistory(append: true),
                child: Text(
                  _loadingHistory
                      ? 'Loading…'
                      : _historyError == null
                      ? 'Load more history'
                      : 'Retry loading history',
                ),
              ),
            if (_selectedRequest != null) ...<Widget>[
              const Divider(height: 32),
              if (_detail != null)
                _requestDetail(context)
              else if (_loadingDetail)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(
                    child: CircularProgressIndicator(
                      semanticsLabel: 'Loading private request details',
                    ),
                  ),
                )
              else if (_detailError != null) ...<Widget>[
                _UnavailableNotice(message: _detailError!),
                TextButton.icon(
                  onPressed: _loadingDetail
                      ? null
                      : () {
                          final request = _selectedRequest;
                          if (request != null) _loadDetail(request);
                        },
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retry request details'),
                ),
              ],
            ],
            if (loading)
              TextButton(
                onPressed: _cancelPending,
                child: const Text('Cancel loading'),
              ),
          ],
        ),
      ),
    );
    return PopScope(
      canPop: _allowPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _confirmLeave();
      },
      child: ReadingPane(child: page),
    );
  }

  bool get _hasDraft =>
      _category != null ||
      _title.text.isNotEmpty ||
      _firstDetail.text.isNotEmpty ||
      _secondDetail.text.isNotEmpty ||
      _reproductionSteps.text.isNotEmpty ||
      _reply.text.isNotEmpty;

  Future<void> _confirmLeave() async {
    if (_confirmingLeave || !mounted) return;
    if (!_busy && !_hasDraft) {
      setState(() => _allowPop = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.of(context).maybePop();
      });
      return;
    }
    _confirmingLeave = true;
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Leave support?'),
        content: Text(
          _busy
              ? 'Sending may already have reached the server. If you leave, '
                    'check your private history before trying again.'
              : 'This draft is only on this screen and will be lost if you leave.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Stay here'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Leave'),
          ),
        ],
      ),
    );
    _confirmingLeave = false;
    if (leave != true || !mounted) return;
    setState(() => _allowPop = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.of(context).maybePop();
    });
  }

  Future<void> _confirmKindChange(String nextKind) async {
    if (_confirmingKindChange || !mounted) return;
    _confirmingKindChange = true;
    setState(() {});
    final discard = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Switch request type?'),
        content: const Text(
          'Switching request type will clear this unsent draft.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Stay with draft'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Discard and switch'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    setState(() => _confirmingKindChange = false);
    if (discard == true) _switchKind(nextKind);
  }

  void _switchKind(String nextKind) {
    _epoch += 1;
    _detailGeneration += 1;
    ref.read(supportFeedbackClientProvider).cancelPending();
    setState(() {
      _kind = nextKind;
      _category = null;
      _history = <Map<String, dynamic>>[];
      _nextCursor = null;
      _selectedRequest = null;
      _detail = null;
      _loadingDetail = false;
      _error = null;
      _historyError = null;
      _detailError = null;
      _detailErrorIsOlder = false;
      _notice = null;
    });
    _clearForm();
    _loadHistory();
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
            title: Text(
              _string(message['from'], 'member') == 'owner' ? 'Lythaus' : 'You',
            ),
            subtitle: Text(_string(message['text'], '')),
          ),
        if (_detailError != null) ...<Widget>[
          _UnavailableNotice(message: _detailError!),
          TextButton.icon(
            onPressed: _loadingDetail
                ? null
                : _detailErrorIsOlder
                ? _loadOlderMessages
                : () {
                    final selected = _selectedRequest;
                    if (selected != null) _loadDetail(selected);
                  },
            icon: const Icon(Icons.refresh),
            label: Text(
              _detailErrorIsOlder
                  ? 'Retry older messages'
                  : 'Retry request details',
            ),
          ),
        ],
        if (_detail?['nextMessageCursor'] is int)
          TextButton(
            onPressed: _loadingDetail ? null : _loadOlderMessages,
            child: const Text('Load older messages'),
          ),
        TextField(
          controller: _reply,
          enabled: request['closed'] != true,
          onChanged: (_) => _replyDraftVersion += 1,
          decoration: InputDecoration(
            labelText: 'Reply privately',
            border: const OutlineInputBorder(),
            helperText: request['closed'] == true
                ? 'This request is closed.'
                : _characterHint('memberMessageCharacters'),
          ),
          minLines: 2,
          maxLines: 5,
        ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed:
              _busy ||
                  request['closed'] == true ||
                  id is! String ||
                  revision is! int
              ? null
              : _sendReply,
          child: const Text('Send reply'),
        ),
      ],
    );
  }

  Future<void> _loadInitial() async {
    if (!mounted) return;
    final epoch = ++_epoch;
    final client = ref.read(supportFeedbackClientProvider);
    setState(() {
      _loading = true;
      _error = null;
      _historyError = null;
    });
    try {
      final options = await client.getOptions();
      if (!_current(client, epoch)) return;
      setState(() {
        _options = options;
        _loading = false;
        _loadingHistory = true;
        _historyError = null;
      });
      final history = await client.list(
        kind: _kind,
        limit: _historyLimit(options),
      );
      if (!_current(client, epoch)) return;
      final items = _validatedHistoryItems(history, _kind);
      setState(() {
        _history = items;
        _nextCursor = _nullableString(history['nextCursor']);
        _loadingHistory = false;
        _error = null;
        _historyError = null;
      });
    } on SupportFeedbackCancelled {
      if (!_current(client, epoch)) return;
      setState(() {
        _loading = false;
        _loadingHistory = false;
        if (_options == null) {
          _error = 'Loading was canceled. Retry to check support availability.';
        } else {
          _historyError =
              'History loading was canceled. Retry to check your private requests.';
        }
      });
    } catch (error) {
      if (!_current(client, epoch)) return;
      setState(() {
        _loading = false;
        _loadingHistory = false;
        if (_options == null) {
          _error = _safeError(error);
        } else {
          _historyError = _safeError(error);
        }
      });
    }
  }

  Future<void> _loadHistory({bool append = false}) async {
    final client = ref.read(supportFeedbackClientProvider);
    final epoch = _epoch;
    setState(() {
      _loadingHistory = true;
      _error = null;
      _historyError = null;
    });
    try {
      final result = await client.list(
        kind: _kind,
        limit: _historyLimit(_options),
        cursor: append ? _nextCursor : null,
      );
      if (!_current(client, epoch)) return;
      final items = _validatedHistoryItems(result, _kind);
      setState(() {
        _history = append
            ? <Map<String, dynamic>>[..._history, ...items]
            : items;
        _nextCursor = _nullableString(result['nextCursor']);
        _loadingHistory = false;
        _historyError = null;
      });
    } on SupportFeedbackCancelled {
      if (!_current(client, epoch)) return;
      setState(() {
        _loadingHistory = false;
        _historyError =
            'History loading was canceled. Retry to check your private requests.';
      });
    } catch (error) {
      if (!_current(client, epoch)) return;
      setState(() {
        _loadingHistory = false;
        _historyError = _safeError(error);
      });
    }
  }

  Future<void> _loadDetail(Map<String, dynamic> request) async {
    final id = request['id'];
    if (id is! String) return;
    final client = ref.read(supportFeedbackClientProvider);
    final epoch = _epoch;
    final previousRequestId = _selectedRequest?['id'];
    final previousReplyRequestId = _replyRequestId;
    final previousDraftVersion = _replyDraftVersion;
    final previousPendingReplyRequestId = _pendingReplyRequestId;
    final hasReplyDraftForPreviousRequest =
        _replyRequestId == previousRequestId && _reply.text.isNotEmpty;
    final hasPendingReplyForPreviousRequest =
        previousPendingReplyRequestId != null &&
        previousPendingReplyRequestId == previousRequestId;
    if (previousRequestId != id &&
        (hasReplyDraftForPreviousRequest ||
            hasPendingReplyForPreviousRequest)) {
      final discard = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Switch request?'),
          content: Text(
            hasPendingReplyForPreviousRequest
                ? 'This reply is still being sent. Switching clears its draft. '
                      'Check this request’s history before trying again.'
                : 'Switching requests will clear this unsent reply draft.',
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Keep reply draft'),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Discard and switch'),
            ),
          ],
        ),
      );
      if (!mounted ||
          !_current(client, epoch) ||
          discard != true ||
          _selectedRequest?['id'] != previousRequestId ||
          _replyRequestId != previousReplyRequestId ||
          _replyDraftVersion != previousDraftVersion ||
          _pendingReplyRequestId != previousPendingReplyRequestId) {
        return;
      }
    }
    final generation = ++_detailGeneration;
    final sameReplyRequest = _replyRequestId == id;
    if (!sameReplyRequest) {
      _replyDraftVersion += 1;
      _reply.clear();
      _replyKey = null;
      _replySignature = null;
      _replyRequestId = id;
    }
    setState(() {
      _selectedRequest = request;
      _detail = null;
      _loadingDetail = true;
      _detailError = null;
      _detailErrorIsOlder = false;
      _error = null;
    });
    try {
      final result = await client.detail(kind: _kind, requestId: id);
      if (!_currentDetail(client, epoch, generation, id)) return;
      final detail = _validatedDetail(result, id, _kind);
      final messages = _maps(detail['messages'])
        ..sort(
          (left, right) =>
              (left['revision'] as int).compareTo(right['revision'] as int),
        );
      setState(() {
        _detail = <String, dynamic>{...detail, 'messages': messages};
        _selectedRequest = _asMap(detail['request']);
        _loadingDetail = false;
        _detailError = null;
      });
    } on SupportFeedbackCancelled {
      if (!_currentDetail(client, epoch, generation, id)) return;
      setState(() {
        _loadingDetail = false;
        _detailError =
            'Loading was canceled. Retry to check this private request.';
      });
    } catch (error) {
      if (!_currentDetail(client, epoch, generation, id)) return;
      setState(() {
        _loadingDetail = false;
        _detailError = _safeError(error);
      });
    }
  }

  Future<void> _loadOlderMessages() async {
    final request = _asMap(_detail?['request']);
    final id = request['id'];
    final cursor = _detail?['nextMessageCursor'];
    if (id is! String || cursor is! int) return;
    if (_loadingDetail) return;
    final client = ref.read(supportFeedbackClientProvider);
    final epoch = _epoch;
    final generation = _detailGeneration;
    setState(() {
      _loadingDetail = true;
      _detailError = null;
      _detailErrorIsOlder = false;
    });
    try {
      final older = await client.detail(
        kind: _kind,
        requestId: id,
        messageBefore: cursor,
      );
      if (!_currentDetail(client, epoch, generation, id)) return;
      final validated = _validatedDetail(older, id, _kind);
      final currentMessages = _maps(_detail?['messages']);
      final olderMessages = _maps(validated['messages']);
      currentMessages.sort(
        (left, right) =>
            (left['revision'] as int).compareTo(right['revision'] as int),
      );
      olderMessages.sort(
        (left, right) =>
            (left['revision'] as int).compareTo(right['revision'] as int),
      );
      setState(() {
        _detail = <String, dynamic>{
          ..._detail!,
          'messages': <Map<String, dynamic>>[
            ...olderMessages,
            ...currentMessages,
          ],
          'nextMessageCursor': validated['nextMessageCursor'],
        };
        _loadingDetail = false;
        _detailError = null;
      });
    } on SupportFeedbackCancelled {
      if (!_currentDetail(client, epoch, generation, id)) return;
      setState(() {
        _loadingDetail = false;
        _detailError = 'Loading was canceled. Retry the older messages.';
        _detailErrorIsOlder = true;
      });
    } catch (error) {
      if (!_currentDetail(client, epoch, generation, id)) return;
      setState(() {
        _loadingDetail = false;
        _detailError = _safeError(error);
        _detailErrorIsOlder = true;
      });
    }
  }

  Future<void> _submit() async {
    if (_busy) return;
    final category = _categoryForSubmit;
    if (category == null) return;
    final first = _firstDetail.text.trim();
    final second = _secondDetail.text.trim();
    final title = _title.text.trim();
    if (title.isEmpty || first.isEmpty || second.isEmpty) {
      setState(() => _error = 'Complete the required fields before sending.');
      return;
    }
    if (!_fitsField(title, 'titleBytes', 'titleCharacters') ||
        !_fitsField(first, 'detailBytes', 'detailCharacters') ||
        !_fitsField(second, 'detailBytes', 'detailCharacters') ||
        (_reproductionSteps.text.trim().isNotEmpty &&
            !_fitsField(
              _reproductionSteps.text.trim(),
              'stepsBytes',
              'stepsCharacters',
            ))) {
      setState(() => _error = 'Shorten the request text to the limits shown.');
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
      } else ...<String, dynamic>{'improvement': first, 'benefit': second},
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
      _pendingMessage = 'Sending your private request…';
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
      final accepted = validateSupportFeedbackMutationResult(
        result,
        kind: _kind,
      );
      final request = _asMap(accepted['request']);
      setState(() {
        _busy = false;
        _pendingMessage = null;
        _category = null;
        _selectedRequest = request;
        _detail = null;
        _loadingDetail = false;
        _detailError = null;
        _notice = 'Your private request was received.';
        _submissionKey = null;
        _submissionSignature = null;
      });
      _clearForm();
      await _loadHistory();
      if (!_current(client, epoch)) return;
      if (request['id'] is String) await _loadDetail(request);
    } on SupportFeedbackCancelled {
      if (_current(client, epoch)) {
        setState(() {
          _busy = false;
          _pendingMessage = null;
          _notice = 'Sending stopped. Check your history before trying again.';
        });
      }
    } catch (error) {
      if (!_current(client, epoch)) return;
      setState(() {
        _busy = false;
        _pendingMessage = null;
        _error = _safeError(error);
      });
    }
  }

  Future<void> _sendReply() async {
    if (_busy) return;
    final request = _asMap(_detail?['request']);
    final id = request['id'];
    final revision = request['revision'];
    final message = _reply.text.trim();
    if (id is! String || revision is! int || message.isEmpty) {
      setState(() => _error = 'Write a reply before sending.');
      return;
    }
    if (request['closed'] == true ||
        !_fitsField(message, 'memberMessageBytes', 'memberMessageCharacters')) {
      setState(
        () => _error = request['closed'] == true
            ? 'This request is closed.'
            : 'Shorten your reply to the limit shown.',
      );
      return;
    }
    final signature = '$id:$revision:$message';
    if (_replyKey == null || _replySignature != signature) {
      _replyKey = _uuid.v4();
      _replySignature = signature;
    }
    final idempotencyKey = _replyKey!;
    final kind = _kind;
    final client = ref.read(supportFeedbackClientProvider);
    final epoch = _epoch;
    final draftVersion = _replyDraftVersion;
    setState(() {
      _busy = true;
      _pendingMessage = 'Sending your reply…';
      _pendingReplyRequestId = id;
      _error = null;
      _notice = null;
    });
    try {
      final result = await client.reply(
        kind: kind,
        requestId: id,
        expectedRevision: revision,
        message: message,
        idempotencyKey: idempotencyKey,
      );
      validateSupportFeedbackMutationResult(result, kind: kind, requestId: id);
      if (!_currentReplyDraft(client, epoch, id, draftVersion)) {
        _finishDetachedReply(
          client,
          epoch,
          notice: _replyRequestId == id && _selectedRequest?['id'] == id
              ? 'Your reply was added to the private history. Your newer draft is still here.'
              : 'A reply to another private request was accepted. Check that request’s history.',
        );
        return;
      }
      setState(() {
        _busy = false;
        _pendingMessage = null;
        _pendingReplyRequestId = null;
        _notice = 'Your reply was added to the private history.';
        _replyKey = null;
        _replySignature = null;
        _reply.clear();
        _replyDraftVersion += 1;
      });
      final completedDraftVersion = _replyDraftVersion;
      await _loadHistory();
      if (!_currentReplyDraft(client, epoch, id, completedDraftVersion)) return;
      await _loadDetail(request);
    } on SupportFeedbackCancelled {
      if (!_current(client, epoch)) return;
      if (!_currentReplyDraft(client, epoch, id, draftVersion)) {
        _finishDetachedReply(
          client,
          epoch,
          notice: _replyRequestId == id && _selectedRequest?['id'] == id
              ? 'Sending stopped. Check this history before trying again.'
              : 'Sending stopped for a reply to another request. Check its history before trying again.',
        );
        return;
      }
      setState(() {
        _busy = false;
        _pendingMessage = null;
        _pendingReplyRequestId = null;
        _notice = 'Sending stopped. Check this history before trying again.';
      });
    } catch (error) {
      if (!_current(client, epoch)) return;
      if (!_currentReplyDraft(client, epoch, id, draftVersion)) {
        _finishDetachedReply(
          client,
          epoch,
          notice: _replyRequestId == id && _selectedRequest?['id'] == id
              ? 'A reply could not be confirmed. Check this history before trying again.'
              : 'A reply to another request could not be confirmed. Check its history before trying again.',
        );
        return;
      }
      setState(() {
        _busy = false;
        _pendingMessage = null;
        _pendingReplyRequestId = null;
        _error = _safeError(error);
      });
    }
  }

  void _finishDetachedReply(
    SupportFeedbackClient client,
    int epoch, {
    required String notice,
  }) {
    if (!_current(client, epoch)) return;
    setState(() {
      _busy = false;
      _pendingMessage = null;
      _pendingReplyRequestId = null;
      _notice = notice;
    });
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
    _pendingMessage = null;
    _submissionKey = null;
    _submissionSignature = null;
    _replyKey = null;
    _replySignature = null;
    _replyRequestId = null;
    _pendingReplyRequestId = null;
    _replyDraftVersion += 1;
  }

  bool _current(SupportFeedbackClient client, int epoch) =>
      mounted && epoch == _epoch && client.isCurrentSession;

  bool _currentDetail(
    SupportFeedbackClient client,
    int epoch,
    int generation,
    String requestId,
  ) =>
      _current(client, epoch) &&
      generation == _detailGeneration &&
      _selectedRequest?['id'] == requestId;

  bool _currentReplyDraft(
    SupportFeedbackClient client,
    int epoch,
    String requestId,
    int draftVersion,
  ) =>
      _current(client, epoch) &&
      _selectedRequest?['id'] == requestId &&
      _replyRequestId == requestId &&
      _replyDraftVersion == draftVersion;

  List<Map<String, dynamic>> _validatedHistoryItems(
    Map<String, dynamic> result,
    String kind,
  ) {
    final rawItems = result['items'];
    final cursor = result['nextCursor'];
    if (rawItems is! List ||
        (cursor != null && cursor is! String) ||
        result['snapshotAt'] is! String) {
      throw const FormatException('Invalid support history response');
    }
    final items = <Map<String, dynamic>>[];
    for (final value in rawItems) {
      if (value is! Map) {
        throw const FormatException('Invalid support history item');
      }
      final item = _asMap(value);
      if (item['id'] is! String ||
          (item['id'] as String).isEmpty ||
          item['kind'] != kind ||
          item['title'] is! String ||
          item['state'] is! String ||
          item['category'] is! String) {
        throw const FormatException('Invalid support history item');
      }
      items.add(item);
    }
    return items;
  }

  Map<String, dynamic> _validatedDetail(
    Map<String, dynamic> result,
    String requestId,
    String kind,
  ) {
    final request = _asMap(result['request']);
    final rawMessages = result['messages'];
    final cursor = result['nextMessageCursor'];
    if (request['id'] != requestId ||
        request['kind'] != kind ||
        request['revision'] is! int ||
        request['title'] is! String ||
        rawMessages is! List ||
        (cursor != null && cursor is! int)) {
      throw const FormatException('Invalid support request details');
    }
    for (final value in rawMessages) {
      if (value is! Map) {
        throw const FormatException('Invalid support message');
      }
      final message = _asMap(value);
      if (message['id'] is! String ||
          message['from'] is! String ||
          message['text'] is! String ||
          message['revision'] is! int) {
        throw const FormatException('Invalid support message');
      }
    }
    return <String, dynamic>{...result, 'request': request};
  }

  String? get _categoryForSubmit {
    final categories = _categories;
    if (categories.isEmpty) return null;
    return categories.contains(_category) ? _category : categories.first;
  }

  int _historyLimit(Map<String, dynamic>? options) {
    final limit = _asMap(options?['limits'])['page'];
    if (limit == null) return _pageSize;
    if (limit is! int || limit < 1 || limit > 100) {
      throw const FormatException('Invalid support page limit');
    }
    return limit < _pageSize ? limit : _pageSize;
  }

  Map<String, dynamic> get _fieldLimits =>
      _asMap(_asMap(_options?['contract'])['limits']);

  String? _characterHint(String field) {
    final maximum = _fieldLimits[field];
    return maximum is int && maximum > 0 ? 'Up to $maximum characters.' : null;
  }

  bool _fitsField(String value, String bytes, String characters) {
    final byteLimit = _fieldLimits[bytes];
    final characterLimit = _fieldLimits[characters];
    return (byteLimit is! int || utf8.encode(value).length <= byteLimit) &&
        (characterLimit is! int || value.runes.length <= characterLimit);
  }

  static Map<String, dynamic> _asMap(Object? value) =>
      value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

  static List<Map<String, dynamic>> _maps(Object? value) => value is List
      ? value.map(_asMap).where((item) => item.isNotEmpty).toList()
      : <Map<String, dynamic>>[];

  static String? _nullableString(Object? value) =>
      value is String && value.isNotEmpty ? value : null;

  static String _string(Object? value, String fallback) =>
      value is String ? value : fallback;

  static String _readable(String value) =>
      value.replaceAll('_', ' ').replaceAll('-', ' ');

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
      if (error.statusCode == 404 && error.code == 'feature_disabled') {
        return 'Support is not available right now.';
      }
      if (error.statusCode == 404) {
        return 'This private request is no longer available.';
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
    child: Semantics(
      liveRegion: true,
      child: Text(message, key: const ValueKey<String>('support-unavailable')),
    ),
  );
}
