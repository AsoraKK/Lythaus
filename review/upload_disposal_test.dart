import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:file_selector/file_selector.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/media/application/private_image_api.dart';
import 'package:lythaus/features/media/application/private_image_upload.dart';

class _QueuedApi extends PrivateImageApi {
  _QueuedApi() : super(Dio(), () async => 'synthetic-local-token');
  int polls = 0;
  final attempts = <PrivateImageAttempt>[];
  CancelToken? observedCancel;
  @override
  Future<PrivateImageStatus> resume(PrivateImageAttempt attempt, {
    required CancelToken cancel,
    required bool Function() isCurrent,
    void Function(int, int)? progress,
  }) async {
    polls++;
    attempts.add(attempt);
    observedCancel = cancel;
    return const PrivateImageStatus('queued', false);
  }
}

void main() {
  testWidgets('UP-23 uses the default 5-second interval and 24-poll limit; manual retry reuses the same attempt', (tester) async {
    final api = _QueuedApi();
    final controller = PrivateImageUploadController(api, enabled: true);
    await tester.runAsync(() async {
      await controller.choose(() async => XFile.fromData(
        Uint8List.fromList([137, 80, 78, 71, 13, 10, 26, 10, 1])));
    });
    await controller.upload();
    expect(api.polls, 1);
    final attempt = api.attempts.single;

    await tester.pump(const Duration(seconds: 4));
    expect(api.polls, 1);
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(api.polls, 2);

    for (var scheduledPoll = 1; scheduledPoll < 24; scheduledPoll++) {
      await tester.pump(const Duration(seconds: 5));
      await tester.pump();
    }
    expect(api.polls, 25);
    await tester.pump(const Duration(seconds: 30));
    expect(api.polls, 25);

    await controller.upload();
    expect(api.polls, 26);
    expect(api.attempts.every((observed) => identical(observed, attempt)), isTrue);
    controller.dispose();
  });

  testWidgets('UP-24 valid local selection disposed before upload makes no API call', (tester) async {
    final api = _QueuedApi();
    final pending = <bool>[];
    final controller = PrivateImageUploadController(api,
      enabled: true, onPendingChanged: pending.add);
    await tester.runAsync(() async {
      await controller.choose(() async => XFile.fromData(
        Uint8List.fromList([137, 80, 78, 71, 13, 10, 26, 10, 1])));
    });
    expect(controller.state.hasImage, isTrue);
    expect(controller.state.started, isFalse);
    expect(api.polls, 0);
    expect(pending.last, isTrue);
    controller.dispose();
    expect(api.polls, 0);
    expect(pending.last, isFalse);
  });

  testWidgets('UP-22 disposal cancels queued polling and releases local reload block', (tester) async {
    final api = _QueuedApi();
    final pending = <bool>[];
    final controller = PrivateImageUploadController(api,
      enabled: true, pollInterval: const Duration(seconds: 1),
      onPendingChanged: pending.add);
    await tester.runAsync(() async {
      await controller.choose(() async => XFile.fromData(
        Uint8List.fromList([137, 80, 78, 71, 13, 10, 26, 10, 1])));
      await controller.upload();
    });
    expect(api.polls, 1);
    expect(pending.last, isTrue);
    controller.dispose();
    expect(api.observedCancel!.isCancelled, isTrue);
    expect(pending.last, isFalse);
    await tester.pump(const Duration(seconds: 30));
    expect(api.polls, 1);
    expect(tester.takeException(), isNull);
  });
}
