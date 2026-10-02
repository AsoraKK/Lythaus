// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';

class ContentEditorScreen extends ConsumerStatefulWidget {
  const ContentEditorScreen({
    super.key,
    required this.contentId,
    required this.text,
    this.isComment = false,
    this.postId,
  });

  final String contentId;
  final String text;
  final bool isComment;
  final String? postId;

  @override
  ConsumerState<ContentEditorScreen> createState() =>
      _ContentEditorScreenState();
}

class _ContentEditorScreenState extends ConsumerState<ContentEditorScreen> {
  late final TextEditingController _controller;
  late final String _actor;
  late final String _scope;
  String? _aiLabel;
  String? _error;
  bool _busy = false;
  bool _locked = false;
  bool _restoring = false;
  String? _draftStatus;
  int _draftVersion = 0;
  ProviderSubscription<String?>? _sessionSub;
  bool _sessionValid = true;

  @override
  void initState() {
    super.initState();
    _actor = ref.read(currentUserProvider)?.id ?? 'session';
    _scope =
        '${widget.isComment ? 'comment' : 'post'}:$_actor:${widget.contentId}';
    final pending = ref.read(contentMutationRegistryProvider).pending(_scope);
    final body = pending?.payload['body'];
    _controller = TextEditingController(
      text: body is Map ? body['body'] as String? ?? widget.text : widget.text,
    );
    if (pending != null) {
      _locked = true;
      _aiLabel = body is Map && body['declaredCreationMode'] == 'ai_assisted'
          ? 'assisted'
          : body is Map
          ? 'human'
          : null;
      _error = pending.payload['method'] == 'PUT'
          ? 'Retry to check the previous edit before changing this content.'
          : 'Check the pending deletion before editing this content.';
    }
    _sessionSub = ref.listenManual(
      currentUserProvider.select((user) => user?.id),
      (previous, next) {
        if ((next ?? 'session') == _actor) return;
        ++_draftVersion;
        _sessionValid = false;
        _controller.clear();
        setState(() {
          _aiLabel = null;
          _locked = true;
          _busy = false;
          _error =
              'Your session changed. Reopen your content after signing in.';
        });
      },
    );
    unawaited(_restoreDraft());
  }

  Future<void> _restoreDraft() async {
    if (_actor == 'session') return;
    _restoring = true;
    final version = _draftVersion;
    final registry = ref.read(contentMutationRegistryProvider);
    await registry.ready;
    if (!mounted || version != _draftVersion) return;
    final pending = registry.pending(_scope);
    final saved = pending != null && !pending.needsReentry
        ? pending.payload['body'] as Map?
        : registry.draft(_scope);
    setState(() {
      _restoring = false;
      if (saved != null) {
        _controller.text = saved['body'] as String? ?? widget.text;
        _aiLabel = saved['declaredCreationMode'] == 'ai_assisted'
            ? 'assisted'
            : saved['declaredCreationMode'] == 'human'
            ? 'human'
            : null;
      }
      _locked = pending != null && !pending.needsReentry;
      if (pending != null) {
        _error = pending.needsReentry
            ? 'Re-enter the same text and disclosure to check the previous edit.'
            : pending.payload['method'] == 'PUT'
            ? 'Retry to check the saved edit.'
            : 'Check the pending deletion before editing.';
      }
    });
  }

  void _saveDraft() {
    final version = ++_draftVersion;
    final registry = ref.read(contentMutationRegistryProvider);
    setState(() => _draftStatus = 'Saving draft…');
    unawaited(
      registry
          .saveDraft(_scope, {
            'body': _controller.text,
            'declaredCreationMode': _aiLabel == 'assisted'
                ? 'ai_assisted'
                : _aiLabel == 'human'
                ? 'human'
                : null,
          })
          .then((saved) {
            if (!mounted || version != _draftVersion) return;
            setState(
              () => _draftStatus = saved
                  ? 'Draft saved on this device.'
                  : 'Draft could not be saved.',
            );
          }),
    );
  }

  @override
  void dispose() {
    _sessionSub?.close();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_sessionValid ||
        _busy ||
        _restoring ||
        (ref.read(currentUserProvider)?.id ?? 'session') != _actor) {
      return;
    }
    final text = _controller.text.trim();
    final validation = text.isEmpty
        ? 'Please enter some text.'
        : text.length > postTextMaxLength
        ? 'Content is too long.'
        : validatePublicPostAuthorship(text: text, aiLabel: _aiLabel);
    if (validation != null) {
      setState(() => _error = validation);
      return;
    }
    final registry = ref.read(contentMutationRegistryProvider);
    final repository = ref.read(postRepositoryProvider);
    final dio = ref.read(secureDioProvider);
    final tokenFuture = ref.read(jwtProvider.future);
    ContentMutationAttempt? attempt;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final token = await tokenFuture;
      if (!mounted) return;
      if (token == null ||
          !_sessionValid ||
          token.isEmpty ||
          (ref.read(currentUserProvider)?.id ?? 'session') != _actor) {
        throw const ContentMutationFailure(
          'Sign in to edit your content.',
          uncertain: false,
        );
      }
      final body = UpdatePostRequest(text: text, aiLabel: _aiLabel).toJson();
      attempt = await registry.beginDurable(_scope, {
        'method': 'PUT',
        'body': body,
      });
      Map<String, dynamic> revised;
      if (widget.isComment) {
        final response = await dio.put<Map<String, dynamic>>(
          '/api/comments/${widget.contentId}',
          data: body,
          options: Options(
            headers: {
              'Authorization': 'Bearer $token',
              'Idempotency-Key': attempt.key,
            },
          ),
        );
        revised = contentResponsePayload(response.data);
      } else {
        final result = await repository.updatePost(
          postId: widget.contentId,
          request: UpdatePostRequest(
            text: text,
            aiLabel: _aiLabel,
            idempotencyKey: attempt.key,
          ),
          token: token,
        );
        switch (result) {
          case CreatePostSuccess(:final post):
            revised = {
              'id': post.id,
              'body': post.text,
              'declaredCreationMode': post.declaredCreationMode,
              'moderationState': post.moderationState,
            };
          case CreatePostError(
            :final message,
            :final code,
            :final outcomeUncertain,
          ):
            throw ContentMutationFailure(
              message,
              code: code,
              uncertain: outcomeUncertain,
            );
          case CreatePostBlocked(:final message):
            throw ContentMutationFailure(message, uncertain: false);
          case CreatePostLimitExceeded(:final message):
            throw ContentMutationFailure(message, uncertain: false);
        }
      }
      if (revised['id'] != widget.contentId ||
          revised['body'] is! String ||
          (revised['body'] as String).isEmpty ||
          revised['declaredCreationMode'] != body['declaredCreationMode'] ||
          revised['moderationState'] is! String) {
        throw const ContentMutationFailure(
          'The edit outcome is unknown. Retry to check the same edit.',
        );
      }
      await registry.finishDurable(
        attempt,
        receipt: OwnedContent(
          widget.isComment ? 'comment' : 'post',
          widget.contentId,
          postId: widget.isComment ? widget.postId : null,
        ),
      );
      if (!mounted ||
          !_sessionValid ||
          (ref.read(currentUserProvider)?.id ?? 'session') != _actor) {
        return;
      }
      Navigator.of(context).pop(revised);
    } catch (error) {
      final failure = contentMutationFailure(error);
      if (attempt != null) {
        try {
          await registry.finishDurable(attempt, uncertain: failure.uncertain);
        } catch (_) {}
      }
      if (!mounted ||
          !_sessionValid ||
          (ref.read(currentUserProvider)?.id ?? 'session') != _actor) {
        return;
      }
      setState(() {
        _busy = false;
        _locked =
            registry.pending(_scope) != null &&
            registry.pending(_scope)?.needsReentry != true;
        _error = failure.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.isComment ? 'Edit comment' : 'Edit post'),
        ),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_error != null) ...[
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              const SizedBox(height: 12),
            ],
            TextField(
              key: ValueKey('content-editor-input:$_sessionValid'),
              controller: _controller,
              enabled: !_busy && !_locked && !_restoring,
              onChanged: (_) => _saveDraft(),
              minLines: 4,
              maxLines: 10,
              decoration: InputDecoration(
                labelText: widget.isComment ? 'Your comment' : 'Your post',
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            if (_restoring) const Text('Restoring draft…'),
            if (_draftStatus != null) Text(_draftStatus!),
            const Text(
              'Choose the authorship of this edit. AI-generated public content is not allowed. '
              'AI-assisted text is limited to 249 user-perceived characters.',
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('Human-authored'),
                  selected: _aiLabel == 'human',
                  onSelected: _busy || _locked || _restoring
                      ? null
                      : (_) {
                          setState(() => _aiLabel = 'human');
                          _saveDraft();
                        },
                ),
                ChoiceChip(
                  label: const Text('AI-assisted'),
                  selected: _aiLabel == 'assisted',
                  onSelected: _busy || _locked || _restoring
                      ? null
                      : (_) {
                          setState(() => _aiLabel = 'assisted');
                          _saveDraft();
                        },
                ),
              ],
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy || _restoring ? null : _submit,
              child: Text(
                _busy
                    ? 'Submitting…'
                    : _locked
                    ? 'Retry same edit'
                    : 'Submit edit',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
