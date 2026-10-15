import 'dart:async';
import 'dart:js_interop';

import 'package:flutter/material.dart';
import 'package:lythaus/core/config/web_release_reload_gate.dart';
import 'package:lythaus/core/config/web_release_update_bridge.dart';
import 'package:lythaus/core/network/pending_authenticated_operations.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:web/web.dart' as web;

@JS('lythausGateFixtureSetDraft')
external set _setDraft(JSFunction action);
@JS('lythausGateFixtureSaveDraft')
external set _saveDraft(JSFunction action);
@JS('lythausGateFixtureBeginPending')
external set _beginPending(JSFunction action);
@JS('lythausGateFixtureFinishPending')
external set _finishPending(JSFunction action);
@JS('lythausGateFixtureStartJournal')
external set _startJournal(JSFunction action);
@JS('lythausGateFixtureChangeSession')
external set _changeSession(JSFunction action);
@JS('lythausGateFixtureReleaseJournal')
external set _releaseJournal(JSFunction action);
@JS('lythausGateFixtureGetDraft')
external set _getDraft(JSFunction action);
@JS('lythausGateFixtureGetAccount')
external set _getAccount(JSFunction action);
@JS('lythausGateFixtureGetPendingJournal')
external set _getPendingJournal(JSFunction action);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final fixture = _ReloadGateFixture();
  await fixture.initialize();
  runApp(_ReloadGateApp(fixture: fixture));
}

class _SecureRecoveryStorage implements ContentRecoveryStorage {
  static const _secureStorage = SecureContentRecoveryStorage();
  Completer<void>? _writeRelease;

  void holdWrites() {
    _writeRelease = Completer<void>();
  }

  void releaseWrites() {
    final release = _writeRelease;
    _writeRelease = null;
    if (release != null && !release.isCompleted) release.complete();
  }

  @override
  Future<String?> read(String key) => _secureStorage.read(key);

  @override
  Future<void> write(String key, String value) async {
    final release = _writeRelease;
    if (release != null) await release.future;
    await _secureStorage.write(key, value);
  }
}

class _ReloadGateFixture {
  final storage = _SecureRecoveryStorage();
  final operations = PendingAuthenticatedOperations();
  late final ContentMutationRegistry registry;
  late final WebReleaseReloadGate gate;
  late final TextEditingController draftController;
  final draftFocus = FocusNode();
  late String account;
  late PostCreationState postState;
  bool authLoading = false;
  int authRevision = 0;
  Object? pendingOperation;
  Future<bool>? heldJournalWrite;

  Future<void> initialize() async {
    account =
        web.window.sessionStorage.getItem('lythaus.fixture.account') ??
        'account-a';
    web.window.sessionStorage.setItem('lythaus.fixture.account', account);
    registry = ContentMutationRegistry(storage: storage)..activate(account);
    await registry.ready;
    final saved = registry.draft('profile:$account');
    final text = saved?['body'] as String? ?? '';
    draftController = TextEditingController(text: text)
      ..addListener(_onDraftChanged);
    postState = PostCreationState(
      text: text,
      draftStatus: saved == null ? null : 'Draft restored on this device.',
    );
    gate = WebReleaseReloadGate(
      registry: registry,
      authSessionRevision: () => authRevision,
      authLoading: () => authLoading,
      hasPendingAuthenticatedWork: () => operations.hasPending,
      postCanSafelyReload: () => postState.canSafelyReload,
      hasFocusedTextEntry: _hasFocusedTextEntry,
      setCanReload: setWebReleaseCanReload,
    );
    registry.addListener(_schedule);
    operations.addListener(_schedule);
    FocusManager.instance.addListener(_schedule);
    _installBrowserHooks();
    unawaited(gate.schedule());
  }

  bool _hasFocusedTextEntry() {
    final context = FocusManager.instance.primaryFocus?.context;
    return context?.findAncestorWidgetOfExactType<EditableText>() != null;
  }

  void _onDraftChanged() {
    postState = PostCreationState(text: draftController.text);
    _schedule();
  }

  void _schedule() {
    unawaited(gate.schedule());
  }

  Future<void> saveDraft() async {
    final text = draftController.text;
    final saved = await registry.saveDraft('profile:$account', {'body': text});
    if (!saved) return;
    postState = PostCreationState(
      text: text,
      draftStatus: 'Draft saved on this device.',
    );
    draftFocus.unfocus();
    await gate.schedule();
  }

  void beginPending() {
    pendingOperation ??= operations.beginOperation();
  }

  void finishPending() {
    final operation = pendingOperation;
    pendingOperation = null;
    if (operation != null) operations.finishOperation(operation);
  }

  void startJournalWrite() {
    storage.holdWrites();
    heldJournalWrite = registry.saveDraft('profile:$account', {
      'body': 'journal write in progress',
    });
    _schedule();
  }

  void changeSession() {
    authLoading = true;
    authRevision++;
    account = 'account-b';
    web.window.sessionStorage.setItem('lythaus.fixture.account', account);
    draftFocus.unfocus();
    draftController.clear();
    postState = const PostCreationState();
    registry.activate(account);
    _schedule();
  }

  void releaseJournalAndFinishSession() {
    storage.releaseWrites();
    unawaited(() async {
      await heldJournalWrite;
      await registry.ready;
      authLoading = false;
      await gate.schedule();
    }());
  }

  void _installBrowserHooks() {
    _setDraft = ((JSString text) {
      draftController.text = text.toDart;
      draftFocus.requestFocus();
    }).toJS;
    _saveDraft = (() => unawaited(saveDraft())).toJS;
    _beginPending = beginPending.toJS;
    _finishPending = finishPending.toJS;
    _startJournal = startJournalWrite.toJS;
    _changeSession = changeSession.toJS;
    _releaseJournal = releaseJournalAndFinishSession.toJS;
    _getDraft = (() => draftController.text.toJS).toJS;
    _getAccount = (() => account.toJS).toJS;
    _getPendingJournal = (() => registry.pendingJournalOperations.toJS).toJS;
  }
}

class _ReloadGateApp extends StatelessWidget {
  const _ReloadGateApp({required this.fixture});
  final _ReloadGateFixture fixture;

  @override
  Widget build(BuildContext context) => MaterialApp(
    home: Scaffold(
      appBar: AppBar(title: const Text('Flutter reload gate fixture')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Text('Account: ${fixture.account}'),
            TextField(
              controller: fixture.draftController,
              focusNode: fixture.draftFocus,
              decoration: const InputDecoration(labelText: 'Private draft'),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: fixture.saveDraft,
              child: const Text('Save draft'),
            ),
          ],
        ),
      ),
    ),
  );
}
