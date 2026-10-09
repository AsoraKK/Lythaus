// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'dart:typed_data';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/authenticity/alpha_api.dart';
import 'package:lythaus/ui/theme/spacing.dart';

final privateAlphaImagePickerProvider = Provider<Future<XFile?> Function()>(
  (ref) =>
      () => openFile(
        acceptedTypeGroups: const [
          XTypeGroup(
            label: 'PNG or JPEG image',
            extensions: ['png', 'jpg', 'jpeg'],
            mimeTypes: ['image/png', 'image/jpeg'],
            uniformTypeIdentifiers: ['public.png', 'public.jpeg'],
          ),
        ],
      ),
);

class AuthenticityPrivateAlphaScreen extends ConsumerStatefulWidget {
  const AuthenticityPrivateAlphaScreen({super.key});
  @override
  ConsumerState<AuthenticityPrivateAlphaScreen> createState() =>
      _PrivateAlphaScreenState();
}

class _PrivateAlphaScreenState
    extends ConsumerState<AuthenticityPrivateAlphaScreen>
    with WidgetsBindingObserver {
  final _text = TextEditingController();
  final _feedback = TextEditingController();
  List<Map<String, dynamic>> _cases = [];
  Map<String, dynamic>? _selected;
  Uint8List? _preview;
  String _kind = 'text_image';
  String? _error;
  Timer? _poll;
  bool _consent = false;
  bool _observer = true;
  bool _explanation = false;
  bool _busy = false;
  bool _foreground = true;
  double? _progress;
  int _polls = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _text.dispose();
    _feedback.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground) {
      _polls = 0;
      unawaited(_load());
    } else {
      _poll?.cancel();
    }
  }

  Future<void> _load({bool allowWhileBusy = false}) async {
    if (_busy && !allowWhileBusy) return;
    try {
      final response = await ref.read(privateAlphaApiProvider).request('');
      final items = (response['items'] as List<dynamic>? ?? const [])
          .cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        _cases = items;
        _selected = items
            .where((item) => item['caseId'] == _selected?['caseId'])
            .firstOrNull;
        _error = null;
      });
      if (_selected != null) await _select(_selected!['caseId'] as String);
      if (_foreground &&
          _polls < 90 &&
          items.any(
            (item) => ['queued', 'analyzing'].contains(item['status']),
          )) {
        _poll?.cancel();
        _poll = Timer(const Duration(seconds: 8), () {
          _polls += 1;
          unawaited(_load());
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Private alpha is unavailable or your account is not admitted.',
        );
      }
    }
  }

  Future<void> _submit() async {
    if (!_consent || _busy) return;
    if (_kind != 'image' && _text.text.trim().isEmpty) {
      setState(() => _error = 'Add text before submitting this case.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _progress = null;
    });
    try {
      final api = ref.read(privateAlphaApiProvider);
      late final String id;
      if (_kind == 'text') {
        id = await api.submitText(
          text: _text.text.trim(),
          observerRequested: false,
          explanationRequested: _explanation,
        );
      } else {
        final file = await ref.read(privateAlphaImagePickerProvider)();
        if (file == null) {
          return;
        }
        if (await file.length() > 10 * 1024 * 1024) throw StateError('size');
        final bytes = await file.readAsBytes();
        final mime =
            bytes.length >= 8 &&
                bytes[0] == 137 &&
                bytes[1] == 80 &&
                bytes[2] == 78
            ? 'image/png'
            : bytes.length >= 3 && bytes[0] == 255 && bytes[1] == 216
            ? 'image/jpeg'
            : null;
        if (mime == null) throw StateError('format');
        id = await api.uploadImage(
          bytes: bytes,
          mime: mime,
          text: _kind == 'text_image' ? _text.text.trim() : null,
          observerRequested: _observer,
          explanationRequested: _explanation,
          progress: (sent, total) {
            if (mounted) {
              setState(() => _progress = total > 0 ? sent / total : null);
            }
          },
        );
      }
      _text.clear();
      _polls = 0;
      await _load(allowWhileBusy: true);
      if (mounted) {
        setState(
          () => _selected = _cases
              .where((item) => item['caseId'] == id)
              .firstOrNull,
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'The alpha case could not be submitted. Check content, connection, and cohort access.',
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _progress = null;
        });
      }
    }
  }

  Future<void> _select(String id) async {
    try {
      final detail = await ref.read(privateAlphaApiProvider).request('/$id');
      if (!mounted) return;
      setState(() {
        _selected = detail;
        _preview = null;
      });
      if (detail['hasImage'] == true &&
          ![
            'uploading',
            'cancelled',
            'deleted',
            'expired',
          ].contains(detail['status'])) {
        _preview = await ref.read(privateAlphaApiProvider).image(id);
        if (mounted) setState(() {});
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'The alpha case could not be opened.');
      }
    }
  }

  Future<void> _action(String action) async {
    final selected = _selected;
    if (selected == null || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final id = selected['caseId'] as String;
      final deleting = action == 'delete';
      await ref
          .read(privateAlphaApiProvider)
          .request(
            action == 'delete' ? '/$id' : '/$id/$action',
            method: action == 'delete' ? 'DELETE' : 'POST',
            data: action == 'advice'
                ? const {}
                : {'message': _feedback.text.trim()},
          );
      _feedback.clear();
      await _load(allowWhileBusy: true);
      if (mounted && !deleting) await _select(id);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'That case action could not finish.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    final components =
        (selected?['execution'] as Map<String, dynamic>?) ?? const {};
    return Scaffold(
      appBar: AppBar(title: const Text('Private authenticity alpha')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 820),
          child: ListView(
            padding: const EdgeInsets.all(Spacing.md),
            children: [
              Text(
                'Explore safety, forensic evidence, and visual observations',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: Spacing.sm),
              const Text(
                'This author-only alpha keeps Safety separate from origin evidence. SAFE-A findings are positive-only, Moondream describes visible observations, and text authorship is unavailable. Nothing here certifies authorship, publishes content, or changes reputation.',
              ),
              const SizedBox(height: Spacing.md),
              DropdownButtonFormField<String>(
                initialValue: _kind,
                decoration: const InputDecoration(labelText: 'Submission'),
                items: const [
                  DropdownMenuItem(value: 'text', child: Text('Text only')),
                  DropdownMenuItem(value: 'image', child: Text('Image only')),
                  DropdownMenuItem(
                    value: 'text_image',
                    child: Text('Text plus image'),
                  ),
                ],
                onChanged: _busy
                    ? null
                    : (value) => setState(() => _kind = value!),
              ),
              if (_kind != 'image') ...[
                const SizedBox(height: Spacing.sm),
                TextField(
                  controller: _text,
                  maxLength: 20000,
                  minLines: 3,
                  maxLines: 8,
                  decoration: const InputDecoration(
                    labelText: 'Text or caption',
                    helperText:
                        'Safety moderation can review text. No text-authorship detector is claimed.',
                  ),
                ),
              ],
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _observer,
                onChanged: _busy || _kind == 'text'
                    ? null
                    : (value) => setState(() => _observer = value),
                title: const Text('Request Moondream visual observations'),
                subtitle: const Text(
                  'Bounded observations only; this does not classify authorship.',
                ),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _explanation,
                onChanged: _busy
                    ? null
                    : (value) => setState(() => _explanation = value),
                title: const Text('Request bounded GPT-OSS explanation'),
                subtitle: const Text(
                  'One optional explanation of evidence and missingness; no new detector verdict.',
                ),
              ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _consent,
                onChanged: _busy
                    ? null
                    : (value) => setState(() => _consent = value ?? false),
                title: const Text(
                  'I am authorized to submit this content and consent to private alpha processing. This is not training or dataset consent.',
                ),
              ),
              FilledButton.icon(
                onPressed: _consent && !_busy ? _submit : null,
                icon: const Icon(Icons.science_outlined),
                label: Text(
                  _kind == 'text' ? 'Submit text' : 'Select and submit',
                ),
              ),
              if (_busy) ...[
                const SizedBox(height: Spacing.sm),
                LinearProgressIndicator(value: _progress),
                const Text('Submitting privately; leave and return safely.'),
              ],
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: Spacing.md),
                  child: Text(
                    _error!,
                    semanticsLabel: _error,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              const SizedBox(height: Spacing.lg),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Your private alpha cases',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Refresh cases',
                    onPressed: _busy
                        ? null
                        : () {
                            _polls = 0;
                            unawaited(_load());
                          },
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              ),
              const Text(
                'Processing is asynchronous. Refreshing or reconnecting never starts another component attempt.',
              ),
              if (_cases.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(Spacing.md),
                  child: Text('No private alpha cases yet.'),
                ),
              for (final item in _cases)
                Card(
                  child: ListTile(
                    selected: item['caseId'] == selected?['caseId'],
                    title: Text(
                      '${item['contentKind']}: ${item['status'].toString().replaceAll('_', ' ')}',
                    ),
                    subtitle: Text(
                      '${item['finding']} · ${item['interpretation']}',
                    ),
                    onTap: () => _select(item['caseId'] as String),
                    trailing: const Icon(Icons.chevron_right),
                  ),
                ),
              if (selected != null) _detail(context, selected, components),
            ],
          ),
        ),
      ),
    );
  }

  Widget _detail(
    BuildContext context,
    Map<String, dynamic> selected,
    Map<String, dynamic> components,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Spacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Result and component execution',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: Spacing.sm),
            Text(selected['explanation'].toString()),
            Text(
              'Finding: ${selected['finding']} · Interpretation: ${selected['interpretation']}',
            ),
            const SizedBox(height: Spacing.sm),
            for (final entry in components.entries)
              Text(
                '${entry.key}: ${entry.value['execution']} · ${entry.value['interpretation']}${entry.value['reason'] == null ? '' : ' (${entry.value['reason']})'}',
              ),
            if (((selected['observer']
                            as Map<String, dynamic>?)?['observations']
                        as List<dynamic>?)
                    ?.isNotEmpty ??
                false) ...[
              const SizedBox(height: Spacing.sm),
              const Text('Moondream observations'),
              for (final observation
                  in ((selected['observer']
                          as Map<String, dynamic>)['observations']
                      as List<dynamic>))
                Text(
                  '${observation['category']}: ${observation['status']} — ${observation['observation']}',
                ),
            ],
            if (_preview != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: Spacing.sm),
                child: Image.memory(
                  _preview!,
                  height: 240,
                  fit: BoxFit.contain,
                  semanticLabel: 'Private alpha image',
                ),
              ),
            Text(
              'Adviser: ${selected['adviserStatus']} · Review: ${selected['reviewState']}',
            ),
            const SizedBox(height: Spacing.sm),
            for (final limitation
                in (selected['limitations'] as List<dynamic>? ?? const []))
              Text(limitation.toString()),
            const SizedBox(height: Spacing.sm),
            TextField(
              controller: _feedback,
              maxLength: 2000,
              minLines: 2,
              maxLines: 5,
              decoration: const InputDecoration(
                labelText: 'Feedback or review request',
                helperText: 'Reviewer input is not automatically ground truth.',
              ),
            ),
            Wrap(
              spacing: Spacing.sm,
              children: [
                TextButton(
                  onPressed: _busy ? null : () => _action('feedback'),
                  child: const Text('Send feedback'),
                ),
                TextButton(
                  onPressed: _busy ? null : () => _action('review'),
                  child: const Text('Request review'),
                ),
                if (selected['adviserStatus'] == 'not_requested')
                  TextButton(
                    onPressed: _busy ? null : () => _action('advice'),
                    child: const Text('Request explanation'),
                  ),
                TextButton(
                  onPressed: _busy ? null : () => _action('delete'),
                  child: const Text('Delete case'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
