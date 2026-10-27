// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:file_selector/file_selector.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/media/application/private_image_api.dart';

final privateImageUploadsEnabledProvider = Provider<bool>((ref) {
  return const bool.fromEnvironment('PRIVATE_IMAGE_UPLOADS_ENABLED');
});

final privateImagePickerProvider = Provider<Future<XFile?> Function()>((ref) {
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

final privateImageApiProvider = Provider<PrivateImageApi>((ref) {
  return PrivateImageApi(
    ref.watch(secureDioProvider),
    () => ref.read(jwtProvider.future),
  );
});

final privateImageUploadProvider =
    StateNotifierProvider.autoDispose<
      PrivateImageUploadController,
      PrivateImageUploadState
    >((ref) {
      final owner = ref.watch(currentUserProvider.select((user) => user?.id));
      final epoch = ref.watch(
        contentMutationRegistryProvider.select(
          (registry) => registry.sessionEpoch,
        ),
      );
      final registry = ref.read(contentMutationRegistryProvider);
      final blockKey = 'private-image:$owner:$epoch';
      return PrivateImageUploadController(
        ref.watch(privateImageApiProvider),
        enabled: owner != null && ref.watch(privateImageUploadsEnabledProvider),
        onPendingChanged: (pending) =>
            registry.setReloadBlocked(blockKey, pending),
      );
    });

class PrivateImageUploadState {
  const PrivateImageUploadState({
    this.hasImage = false,
    this.busy = false,
    this.started = false,
    this.status,
    this.error,
    this.progress,
  });

  final bool hasImage;
  final bool busy;
  final bool started;
  final PrivateImageStatus? status;
  final String? error;
  final double? progress;
  bool get blocksPost => hasImage || busy;
}

class PrivateImageUploadController
    extends StateNotifier<PrivateImageUploadState> {
  PrivateImageUploadController(
    this._api, {
    required this.enabled,
    this.onPendingChanged,
    this.pollInterval = const Duration(seconds: 5),
    this.maxPolls = 24,
  }) : super(const PrivateImageUploadState());

  final PrivateImageApi _api;
  final bool enabled;
  final void Function(bool)? onPendingChanged;
  final Duration pollInterval;
  final int maxPolls;
  PrivateImageAttempt? _attempt;
  final _cancel = CancelToken();
  Timer? _poll;
  int _polls = 0;
  bool _foreground = true;

  bool get _current => mounted && !_cancel.isCancelled;

  void _set(PrivateImageUploadState value) {
    if (!_current) return;
    state = value;
    onPendingChanged?.call(value.blocksPost);
  }

  Future<void> choose(Future<XFile?> Function() picker) async {
    if (!enabled || state.busy || state.started) return;
    _set(PrivateImageUploadState(hasImage: state.hasImage, busy: true));
    try {
      final file = await picker();
      if (!_current) return;
      if (file == null) {
        _set(PrivateImageUploadState(hasImage: _attempt != null));
        return;
      }
      if (await file.length() > privateImageMaxBytes) {
        throw const FormatException('Image too large');
      }
      if (!_current) return;
      final buffer = BytesBuilder(copy: false);
      await for (final chunk in file.openRead()) {
        if (!_current) return;
        if (buffer.length + chunk.length > privateImageMaxBytes) {
          throw const FormatException('Image too large');
        }
        buffer.add(chunk);
      }
      if (!_current) return;
      final bytes = buffer.takeBytes();
      final png =
          bytes.length >= 8 &&
          bytes[0] == 137 &&
          bytes[1] == 80 &&
          bytes[2] == 78 &&
          bytes[3] == 71 &&
          bytes[4] == 13 &&
          bytes[5] == 10 &&
          bytes[6] == 26 &&
          bytes[7] == 10;
      final jpeg =
          bytes.length >= 3 &&
          bytes[0] == 255 &&
          bytes[1] == 216 &&
          bytes[2] == 255;
      if (!png && !jpeg) throw const FormatException('Unsupported image');
      _attempt = PrivateImageAttempt(bytes, png ? 'image/png' : 'image/jpeg');
      _set(const PrivateImageUploadState(hasImage: true));
    } catch (_) {
      _set(
        PrivateImageUploadState(
          hasImage: _attempt != null,
          error: 'Choose a PNG or JPEG image no larger than 10 MiB.',
        ),
      );
    }
  }

  Future<void> upload() async {
    final attempt = _attempt;
    if (!enabled || !_current || state.busy || attempt == null) return;
    _poll?.cancel();
    _set(
      PrivateImageUploadState(
        hasImage: true,
        busy: true,
        started: true,
        status: state.status,
      ),
    );
    try {
      final result = await _api.resume(
        attempt,
        cancel: _cancel,
        isCurrent: () => _current,
        progress: (sent, total) {
          _set(
            PrivateImageUploadState(
              hasImage: true,
              busy: true,
              started: true,
              progress: total > 0 ? (sent / total).clamp(0, 1) : null,
            ),
          );
        },
      );
      if (!_current) return;
      _set(
        PrivateImageUploadState(hasImage: true, started: true, status: result),
      );
      _schedulePoll();
    } catch (error) {
      if (!_current) return;
      final code = error is DioException && error.response?.data is Map
          ? (error.response!.data as Map)['error']
          : null;
      _set(
        PrivateImageUploadState(
          hasImage: true,
          started: true,
          status: state.status,
          error: code == 'feature_disabled'
              ? 'Private image uploads are not available yet. Your image has not been posted.'
              : attempt.stage == PrivateImageStage.status
              ? 'Image status could not be checked. Retry checks this same upload.'
              : 'Upload is unconfirmed. Retry continues this same private upload.',
        ),
      );
    }
  }

  void _schedulePoll() {
    if (!_current ||
        !_foreground ||
        _polls >= maxPolls ||
        state.status?.isPending != true) {
      return;
    }
    _poll = Timer(pollInterval, () {
      _polls++;
      unawaited(upload());
    });
  }

  void setForeground(bool foreground) {
    _foreground = foreground;
    _poll?.cancel();
    if (foreground) {
      _schedulePoll();
    }
  }

  void clear() {
    if (state.busy) return;
    _poll?.cancel();
    _polls = 0;
    _attempt = null;
    _set(const PrivateImageUploadState());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _cancel.cancel('Image session ended');
    onPendingChanged?.call(false);
    _attempt = null;
    super.dispose();
  }
}
