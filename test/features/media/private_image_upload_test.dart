import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/features/media/application/private_image_api.dart';
import 'package:lythaus/features/media/application/private_image_upload.dart';
import 'package:lythaus/features/media/presentation/private_image_upload_card.dart';

import '../../helpers/content_recovery.dart';

const _id = '019a09e0-0000-7000-8000-000000000001';
final _png = Uint8List.fromList([137, 80, 78, 71, 13, 10, 26, 10, 1]);
final _owner = StateProvider<User?>((ref) => _user('owner-a'));

User _user(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

Map<String, dynamic> _status([String status = 'review']) => {
  'uploadSessionId': _id,
  'status': status,
  'expiresAt': '2026-10-23T00:00:00Z',
  'processingComplete': status == 'review',
  'private': true,
  'publication': {'allowed': false},
  'safety': {'status': 'not_run'},
  'authenticity': {'status': 'not_run'},
};

ResponseBody _json(Map<String, dynamic> data, [int status = 200]) =>
    ResponseBody.fromString(
      jsonEncode(data),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final Future<ResponseBody> Function(RequestOptions, Stream<Uint8List>?)
  respond;
  @override
  void close({bool force = false}) {}
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancelFuture,
  ) => respond(options, stream);
}

class _Fixture {
  final calls = <RequestOptions>[];
  final uploaded = <int>[];
  String status = 'review';
  String? failOnce;
  late final Dio dio =
      Dio(BaseOptions(baseUrl: 'https://api.example.invalid/api'))
        ..interceptors.add(CanonicalApiPathInterceptor())
        ..httpClientAdapter = _Adapter((options, stream) async {
          calls.add(options);
          expect(options.uri.origin, 'https://api.example.invalid');
          expect(options.followRedirects, isFalse);
          expect(options.headers['Authorization'], 'Bearer synthetic-token');
          final stage = options.method == 'GET'
              ? 'status'
              : options.path.endsWith('/bytes')
              ? 'bytes'
              : options.path.endsWith('/finalise')
              ? 'finalise'
              : 'create';
          if (failOnce == stage) {
            failOnce = null;
            throw DioException(
              requestOptions: options,
              type: DioExceptionType.receiveTimeout,
            );
          }
          if (stage == 'create') {
            expect(options.data, {
              'size': _png.length,
              'contentType': 'image/png',
              'checksumSha256': sha256.convert(_png).toString(),
            });
            return _json({
              'uploadSessionId': _id,
              'contentType': 'image/png',
              'checksumSha256': sha256.convert(_png).toString(),
              'uploadUrl': 'https://untrusted.invalid/never-used',
            }, 201);
          }
          if (stage == 'bytes') {
            expect(options.contentType, 'image/png');
            uploaded.addAll(
              await stream!.fold<List<int>>(
                [],
                (all, chunk) => all..addAll(chunk),
              ),
            );
            return _json({'uploadSessionId': _id, 'status': 'stored'}, 201);
          }
          if (stage == 'finalise') {
            return _json({
              'uploadSessionId': _id,
              'status': 'queued',
              'eventId': 'synthetic-event',
            });
          }
          return _json(_status(status));
        });
  late final api = PrivateImageApi(dio, () async => 'synthetic-token');
}

class _PollingApi extends PrivateImageApi {
  _PollingApi() : super(Dio(), () async => 'synthetic-token');
  int polls = 0;
  @override
  Future<PrivateImageStatus> resume(
    PrivateImageAttempt attempt, {
    required CancelToken cancel,
    required bool Function() isCurrent,
    void Function(int, int)? progress,
  }) async {
    polls++;
    return const PrivateImageStatus('queued', false);
  }
}

void main() {
  test(
    'upload uses canonical stored receipt and never follows a returned URL',
    () async {
      final fixture = _Fixture();
      final attempt = PrivateImageAttempt(_png, 'image/png');
      final result = await fixture.api.resume(
        attempt,
        cancel: CancelToken(),
        isCurrent: () => true,
      );
      expect(fixture.uploaded, _png);
      expect(fixture.calls.map((call) => call.uri.path), [
        '/api/media/uploads',
        '/api/media/uploads/$_id/bytes',
        '/api/media/uploads/$_id/finalise',
        '/api/media/uploads/$_id',
      ]);
      expect(result.status, 'review');
      expect(attempt.stage, PrivateImageStage.status);
    },
  );

  for (final failure in ['create', 'bytes', 'finalise', 'status']) {
    test(
      '$failure retry resumes the same stage and preserves write keys',
      () async {
        final fixture = _Fixture()..failOnce = failure;
        final attempt = PrivateImageAttempt(_png, 'image/png');
        Future<PrivateImageStatus> run() => fixture.api.resume(
          attempt,
          cancel: CancelToken(),
          isCurrent: () => true,
        );
        await expectLater(run(), throwsA(isA<DioException>()));
        await run();
        final creates = fixture.calls
            .where((call) => call.path.endsWith('/uploads'))
            .toList();
        final finalises = fixture.calls
            .where((call) => call.path.endsWith('/finalise'))
            .toList();
        expect(creates.length, failure == 'create' ? 2 : 1);
        expect(creates.map((call) => call.headers['Idempotency-Key']).toSet(), {
          attempt.createKey,
        });
        expect(finalises.length, failure == 'finalise' ? 2 : 1);
        expect(
          finalises.map((call) => call.headers['Idempotency-Key']).toSet(),
          {attempt.finaliseKey},
        );
        expect(attempt.createKey, isNot(attempt.finaliseKey));
      },
    );
  }

  test('untrusted or successful-looking status never becomes a result', () {
    for (final patch in <Map<String, dynamic>>[
      {'status': 'approved'},
      {'private': false},
      {'processingComplete': false},
      {
        'publication': {'allowed': true},
      },
      {
        'authenticity': {'status': 'human'},
      },
      {
        'safety': {'status': 'safe'},
      },
      {'uploadSessionId': 'another-owner'},
      {'expiresAt': 'invalid'},
    ]) {
      expect(
        () => PrivateImageStatus.parse({..._status(), ...patch}, _id),
        throwsFormatException,
      );
    }
  });

  test(
    'session loss during token retrieval prevents every network request',
    () async {
      final fixture = _Fixture();
      final token = Completer<String?>();
      var current = true;
      final api = PrivateImageApi(fixture.dio, () => token.future);
      final response = api.resume(
        PrivateImageAttempt(_png, 'image/png'),
        cancel: CancelToken(),
        isCurrent: () => current,
      );
      current = false;
      token.complete('synthetic-token');
      await expectLater(response, throwsStateError);
      expect(fixture.calls, isEmpty);
    },
  );

  test('disabled controller never opens picker or uploads', () async {
    final fixture = _Fixture();
    final controller = PrivateImageUploadController(
      fixture.api,
      enabled: false,
    );
    await controller.choose(() async => throw StateError('Must not pick'));
    await controller.upload();
    expect(controller.state.blocksPost, isFalse);
    expect(fixture.calls, isEmpty);
    controller.dispose();
  });

  test(
    'bad images remain local and a stale picker cannot publish selection',
    () async {
      final fixture = _Fixture();
      final controller = PrivateImageUploadController(
        fixture.api,
        enabled: true,
      );
      await controller.choose(
        () async => XFile.fromData(Uint8List.fromList([1, 2, 3])),
      );
      expect(controller.state.hasImage, isFalse);
      expect(controller.state.error, contains('PNG or JPEG'));
      final pick = Completer<XFile?>();
      final pending = controller.choose(() => pick.future);
      controller.dispose();
      pick.complete(XFile.fromData(_png));
      await pending;
      expect(fixture.calls, isEmpty);
    },
  );

  test(
    'post request rejects image-bearing text instead of silently dropping it',
    () {
      expect(
        () => const CreatePostRequest(
          text: 'Text',
          mediaUrl: 'private-image',
        ).toJson(),
        throwsArgumentError,
      );
      expect(
        () => const CreatePostRequest(
          text: 'Text',
          contentType: 'image',
        ).toJson(),
        throwsArgumentError,
      );
      expect(
        const PostCreationState(
          text: 'Text',
          aiLabel: 'human',
          mediaUrl: 'private-image',
        ).isValid,
        isFalse,
      );
    },
  );

  testWidgets(
    'queued polling is bounded, foreground-only and never reuploads',
    (tester) async {
      final api = _PollingApi();
      final controller = PrivateImageUploadController(
        api,
        enabled: true,
        pollInterval: const Duration(seconds: 1),
        maxPolls: 2,
      );
      await tester.runAsync(() async {
        await controller.choose(() async => XFile.fromData(_png));
        await controller.upload();
      });
      controller.setForeground(false);
      await tester.pump(const Duration(seconds: 10));
      expect(api.polls, 1);
      controller.setForeground(true);
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(seconds: 1));
        await tester.pump();
      }
      expect(api.polls, 3);
      controller.dispose();
    },
  );

  Future<ProviderContainer> showCard(
    WidgetTester tester,
    _Fixture fixture, {
    Future<XFile?> Function()? picker,
    bool composer = false,
    double textScale = 1,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWith((ref) => ref.watch(_owner)),
          canCreatePostProvider.overrideWithValue(true),
          privateImageUploadsEnabledProvider.overrideWithValue(true),
          privateImageApiProvider.overrideWithValue(fixture.api),
          privateImagePickerProvider.overrideWithValue(
            picker ?? () async => XFile.fromData(_png),
          ),
          contentRecoveryStorageProvider.overrideWithValue(
            MemoryContentRecoveryStorage(),
          ),
        ],
        child: MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(textScale)),
            child: child!,
          ),
          home: composer
              ? const CreatePostScreen()
              : const Scaffold(
                  body: SingleChildScrollView(
                    child: PrivateImageUploadCard(canEdit: true),
                  ),
                ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  }

  testWidgets(
    'processing completion presents unrun checks and no success claim',
    (tester) async {
      final fixture = _Fixture();
      await showCard(tester, fixture);
      await tester.tap(find.text('Choose image'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Upload privately'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Image processing finished. Safety and authenticity checks have not run.',
        ),
        findsOneWidget,
      );
      expect(
        find.textContaining('Clearing it does not delete'),
        findsOneWidget,
      );
      expect(find.text('Upload privately'), findsNothing);
    },
  );

  testWidgets(
    'account switch clears selection and ignores late picker results',
    (tester) async {
      final fixture = _Fixture();
      final pick = Completer<XFile?>();
      final container = await showCard(
        tester,
        fixture,
        picker: () => pick.future,
      );
      await tester.tap(find.text('Choose image'));
      await tester.pump();
      container.read(_owner.notifier).state = _user('owner-b');
      await tester.pump();
      pick.complete(XFile.fromData(_png));
      await tester.pumpAndSettle();
      expect(find.text('Image selected on this device.'), findsNothing);
      expect(find.text('Choose image'), findsOneWidget);
      expect(fixture.calls, isEmpty);
    },
  );

  testWidgets(
    'composer blocks image-bearing submission until explicitly cleared',
    (tester) async {
      final fixture = _Fixture();
      final container = await showCard(tester, fixture, composer: true);
      container
          .read(postCreationProvider.notifier)
          .updateText('Synthetic text');
      container.read(postCreationProvider.notifier).setAiLabel('human');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Choose image'));
      await tester.tap(find.text('Choose image'));
      await tester.pumpAndSettle();
      final post = find.widgetWithText(FilledButton, 'Post');
      expect(tester.widget<FilledButton>(post).onPressed, isNull);
      await tester.tap(find.byTooltip('Close composer'));
      await tester.pump();
      expect(find.byType(CreatePostScreen), findsOneWidget);
      expect(
        find.textContaining('Finish or clear the private image'),
        findsOneWidget,
      );
      expect(
        await container.read(postCreationProvider.notifier).submit(),
        isFalse,
      );
      expect(fixture.calls, isEmpty);
      await tester.ensureVisible(find.text('Clear selection'));
      await tester.tap(find.text('Clear selection'));
      await tester.pumpAndSettle();
      expect(tester.widget<FilledButton>(post).onPressed, isNotNull);
    },
  );

  testWidgets(
    'private controls remain readable at 320 pixels and double text',
    (tester) async {
      tester.view.physicalSize = const Size(320, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final fixture = _Fixture();
      await showCard(tester, fixture, textScale: 2);
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('Choose image'));
      await tester.tap(find.text('Choose image'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Upload privately'));
      expect(tester.takeException(), isNull);
      expect(find.text('Clear selection'), findsOneWidget);
    },
  );
}
