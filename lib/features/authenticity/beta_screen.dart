// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'dart:typed_data';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/authenticity/beta_api.dart';
import 'package:lythaus/ui/theme/spacing.dart';

final betaImagePickerProvider = Provider<Future<XFile?> Function()>((ref) {
  return () => openFile(
    acceptedTypeGroups: const [
      XTypeGroup(
        label: 'PNG or JPEG image',
        extensions: ['png', 'jpg', 'jpeg'],
        mimeTypes: ['image/png', 'image/jpeg'],
        uniformTypeIdentifiers: ['public.png', 'public.jpeg'],
      ),
    ],
  );
});

class AuthenticityBetaScreen extends ConsumerStatefulWidget {
  const AuthenticityBetaScreen({super.key});
  @override
  ConsumerState<AuthenticityBetaScreen> createState() =>
      _AuthenticityBetaScreenState();
}

class _AuthenticityBetaScreenState extends ConsumerState<AuthenticityBetaScreen>
    with WidgetsBindingObserver {
  List<Map<String, dynamic>> _cases = [];
  Map<String, dynamic>? _selected;
  Uint8List? _preview;
  int _selection = 0;
  String? _error;
  bool _consent = false, _busy = false, _loading = false, _foreground = true;
  double? _progress;
  Timer? _poll;
  int _polls = 0;
  final _feedback = TextEditingController();
  int _sandboxBalance = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  @override
  void dispose() {
    _poll?.cancel();
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

  Future<void> _load() async {
    if (_loading || !mounted) {
      return;
    }
    _loading = true;
    try {
      final response = await ref.read(betaApiProvider).request('');
      final cases = (response['items'] as List<dynamic>)
          .cast<Map<String, dynamic>>();
      if (!mounted) {
        return;
      }
      setState(() {
        _cases = cases;
        _error = null;
        _selected = cases
            .where((item) => item['caseId'] == _selected?['caseId'])
            .firstOrNull;
      });
      if (_selected != null) await _select(_selected!['caseId'] as String);
      if (_foreground &&
          _polls < 90 &&
          cases.any(
            (item) => ['queued', 'analyzing'].contains(item['status']),
          )) {
        _poll?.cancel();
        _poll = Timer(const Duration(seconds: 10), () {
          _polls++;
          unawaited(_load());
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error =
              'The private beta is unavailable, or your account is not admitted. You can retry without creating another analysis.';
        });
      }
    } finally {
      _loading = false;
    }
  }

  Future<void> _upload() async {
    if (!_consent || _busy) {
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _progress = null;
    });
    try {
      final file = await ref.read(betaImagePickerProvider)();
      if (file == null) {
        return;
      }
      if (await file.length() > 10 * 1024 * 1024) {
        throw StateError('size');
      }
      final bytes = await file.readAsBytes();
      final mime = bytes.length >= 8 && bytes[0] == 137 && bytes[1] == 80
          ? 'image/png'
          : bytes.length >= 3 && bytes[0] == 255 && bytes[1] == 216
          ? 'image/jpeg'
          : null;
      if (mime == null) {
        throw StateError('format');
      }
      final id = await ref.read(betaApiProvider).upload(bytes, mime, (
        sent,
        total,
      ) {
        if (mounted) {
          setState(() {
            _progress = total > 0 ? sent / total : null;
          });
        }
      });
      _polls = 0;
      await _load();
      if (mounted) {
        setState(() {
          _selected = _cases.where((item) => item['caseId'] == id).firstOrNull;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error =
              'Upload could not finish. Check your connection, image format, and beta availability. Refresh cases before retrying.';
        });
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

  Future<void> _action(String action) async {
    final selected = _selected;
    if (selected == null || _busy) {
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(betaApiProvider)
          .request(
            '/${selected['caseId']}${action == 'delete' ? '' : '/$action'}',
            method: action == 'delete' ? 'DELETE' : 'POST',
            data: {'message': _feedback.text.trim()},
          );
      _feedback.clear();
      await _load();
    } catch (_) {
      if (mounted) {
        setState(() {
          _error =
              'This action could not finish. Refresh the case and try again.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  Future<void> _select(String id) async {
    final selection = ++_selection;
    try {
      final detail = await ref.read(betaApiProvider).request('/$id');
      if (mounted && selection == _selection) {
        setState(() {
          _selected = detail;
          _preview = null;
        });
      }
      if ([
        'complete',
        'inconclusive',
        'unsupported',
      ].contains(detail['status'])) {
        try {
          final preview = await ref.read(betaApiProvider).image(id);
          if (mounted &&
              selection == _selection &&
              _selected?['caseId'] == id) {
            setState(() {
              _preview = preview;
            });
          }
        } catch (_) {}
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'The case could not be opened. Refresh and try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    return Scaffold(
      appBar: AppBar(title: const Text('Authenticity beta')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 780),
          child: ListView(
            padding: const EdgeInsets.all(Spacing.md),
            children: [
              Text(
                'Explore image evidence privately',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: Spacing.sm),
              const Text(
                'Your image is visible only to you and authorized reviewers. Results do not certify authorship, publish content, or change rewards or reputation.',
              ),
              const SizedBox(height: Spacing.md),
              const Text(
                'Choose a still RGB PNG or JPEG, up to 10 MiB and 16 megapixels, at least 256 × 256. HEIC, animation, and unusual color modes are unsupported. JPEG processing can destroy useful evidence. Converting JPEG to PNG does not restore it.',
              ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _consent,
                onChanged: _busy
                    ? null
                    : (value) => setState(() {
                        _consent = value ?? false;
                      }),
                title: const Text(
                  'I am authorized to submit this image and consent to private beta processing, including existing Safety checks. This does not grant training or dataset consent.',
                ),
              ),
              FilledButton.icon(
                onPressed: _consent && !_busy ? _upload : null,
                icon: const Icon(Icons.upload_file),
                label: const Text('Select and upload image'),
              ),
              if (_busy) ...[
                const SizedBox(height: Spacing.sm),
                LinearProgressIndicator(value: _progress),
                const Text(
                  'Uploading or saving. Please keep this page open until the upload finishes.',
                ),
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
                      'Your private cases',
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
                'You can leave after uploading and return here. Processing ends within 15 minutes; refreshing never starts a new model call.',
              ),
              if (_cases.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(Spacing.md),
                  child: Text('No private cases yet.'),
                ),
              for (final item in _cases)
                Card(
                  child: ListTile(
                    selected: item['caseId'] == selected?['caseId'],
                    title: Text(
                      (item['status'] as String).replaceAll('_', ' '),
                    ),
                    subtitle: Text(
                      '${item['createdAt']} · Review: ${item['reviewState']}',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => _select(item['caseId'] as String),
                  ),
                ),
              if (selected != null)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(Spacing.md),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Image evidence',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: Spacing.sm),
                        Text(selected['explanation'] as String),
                        if (_preview != null)
                          Image.memory(
                            _preview!,
                            height: 240,
                            fit: BoxFit.contain,
                            semanticLabel:
                                'Private display copy of your submitted image',
                          ),
                        Text(
                          'Advice: ${selected['advisoryStatus']} · Review: ${selected['reviewState']}',
                        ),
                        const SizedBox(height: Spacing.sm),
                        for (final limitation
                            in selected['limitations'] as List<dynamic>)
                          Text(limitation as String),
                        const SizedBox(height: Spacing.sm),
                        Text(
                          'Analysis: ${(selected['versions'] as Map<String, dynamic>)['analysis']}',
                        ),
                        for (final review
                            in (selected['reviews'] as List<dynamic>? ?? []))
                          Text(
                            'Review (${review['policyVersion']}): ${review['message']}',
                          ),
                        TextField(
                          controller: _feedback,
                          maxLength: 2000,
                          minLines: 2,
                          maxLines: 5,
                          decoration: const InputDecoration(
                            labelText: 'Feedback or review request',
                            helperText:
                                'Reviewer input is not automatically ground truth.',
                          ),
                        ),
                        Wrap(
                          spacing: Spacing.sm,
                          children: [
                            TextButton(
                              onPressed: _busy
                                  ? null
                                  : () => _action('feedback'),
                              child: const Text('Send feedback'),
                            ),
                            TextButton(
                              onPressed: _busy ? null : () => _action('review'),
                              child: const Text('Request review'),
                            ),
                            if (selected['status'] == 'uploading')
                              TextButton(
                                onPressed: _busy
                                    ? null
                                    : () => _action('finalise'),
                                child: const Text('Finish uploaded case'),
                              ),
                            if ([
                              'uploading',
                              'queued',
                              'analyzing',
                              'paused',
                            ].contains(selected['status']))
                              TextButton(
                                onPressed: _busy
                                    ? null
                                    : () => _action('cancel'),
                                child: const Text('Cancel analysis'),
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
                ),
              const SizedBox(height: Spacing.md),
              ExpansionTile(
                title: const Text('Rewards and reputation sandbox'),
                children: [
                  Padding(
                    padding: const EdgeInsets.all(Spacing.md),
                    child: Column(
                      children: [
                        Text(
                          'Preview only. These controls do not contact rewards or reputation services. Simulated balance: $_sandboxBalance.',
                        ),
                        Wrap(
                          spacing: Spacing.sm,
                          children: [
                            TextButton(
                              onPressed: () => setState(() {
                                _sandboxBalance += 5;
                              }),
                              child: const Text('Simulate reward'),
                            ),
                            TextButton(
                              onPressed: () => setState(() {
                                _sandboxBalance = 0;
                              }),
                              child: const Text('Reset preview'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
