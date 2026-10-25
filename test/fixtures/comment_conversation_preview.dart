import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/presentation/comment_thread_screen.dart';

const _postId = '0192c000-0000-7000-8000-000000000001';
final _rows = <Map<String, dynamic>>[
  _comment(
    'root',
    'Nandi',
    'The new late bus makes this route more useful. Where can we find the weekend timetable?',
    '2026-10-22T10:00:00Z',
  ),
  _comment(
    'older',
    'Sam',
    'Clearer signs at the station would help people find the right stop.',
    '2026-10-21T10:00:00Z',
  ),
  _comment(
    'reply',
    'Theo',
    'A current schedule at each stop would be useful. We could also ask for an accessible online version.',
    '2026-10-22T11:00:00Z',
    parent: 'root',
  ),
  _comment(
    'nested',
    'Nandi',
    'Agreed. A link to the original schedule would make updates easier to verify.',
    '2026-10-22T12:00:00Z',
    parent: 'reply',
  ),
];

Map<String, dynamic> _comment(
  String id,
  String author,
  String body,
  String time, {
  String? parent,
}) => {
  'id': id,
  'postId': _postId,
  'authorId': 'synthetic-$author',
  'authorDisplayName': author,
  'body': body,
  'createdAt': time,
  'parentId': parent,
  'conversationId': parent == null ? id : 'root',
  'depth': parent == null ? 0 : 1,
  'moderationState': 'allowed',
  'declaredCreationMode': 'human',
  'deleted': false,
  'replyCount': id == 'root' ? 2 : 0,
};

class _Storage implements ContentRecoveryStorage {
  final _values = <String, String>{};
  @override
  Future<String?> read(String key) async => _values[key];
  @override
  Future<void> write(String key, String value) async => _values[key] = value;
}

class _PreviewAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancelFuture,
  ) async {
    final params = options.queryParameters;
    Object result;
    var status = 200;
    if (options.method == 'POST') {
      final body = Map<String, dynamic>.from(options.data as Map);
      final row = {
        ...body,
        'id': 'pending-${_rows.length}',
        'postId': _postId,
        'authorId': 'synthetic-preview-member',
        'authorDisplayName': 'Preview member',
        'createdAt': DateTime.now().toUtc().toIso8601String(),
        'moderationState': 'under_review',
      };
      _rows.add(row);
      result = row;
      status = 201;
    } else if (options.path.endsWith('/owner-view')) {
      final id = options.path.split('/').reversed.skip(1).first;
      result = {'comment': _rows.firstWhere((row) => row['id'] == id)};
    } else if (options.path == '/api/posts/$_postId/comments') {
      final items = _rows
          .where(
            (row) =>
                row['moderationState'] == 'allowed' &&
                (params['targetId'] != null
                    ? row['id'] == params['targetId']
                    : params['conversationId'] != null
                    ? row['parentId'] != null &&
                          row['conversationId'] == params['conversationId']
                    : row['parentId'] == null),
          )
          .toList();
      items.sort(
        (a, b) =>
            (a['createdAt'] as String).compareTo(b['createdAt'] as String) *
            (params['conversationId'] == null && params['sort'] == 'newest'
                ? -1
                : 1),
      );
      result = {
        'items': items,
        'nextCursor': null,
        'refreshCursor': null,
        if (params['revalidateIds'] is String)
          'revalidatedItems': _rows
              .where(
                (row) =>
                    (params['revalidateIds'] as String)
                        .split(',')
                        .contains(row['id']) &&
                    row['moderationState'] == 'allowed',
              )
              .toList(),
        'capabilities': {'conversations': true, 'nestedReplies': true},
      };
    } else {
      result = {'error': 'synthetic_preview_route_unavailable'};
      status = 503;
    }
    return ResponseBody.fromString(
      jsonEncode(result),
      status,
      headers: {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await (FontLoader(
    'Roboto',
  )..addFont(rootBundle.load('assets/fonts/Manrope-Regular.ttf'))).load();
  final params = Uri.base.queryParameters;
  final dio = Dio()..httpClientAdapter = _PreviewAdapter();
  final scale = double.tryParse(params['scale'] ?? '') ?? 1;
  runApp(
    ProviderScope(
      overrides: [
        secureDioProvider.overrideWithValue(dio),
        contentRecoveryStorageProvider.overrideWithValue(_Storage()),
        currentUserProvider.overrideWithValue(
          User(
            id: 'synthetic-preview-member',
            email: 'preview@example.invalid',
            role: UserRole.user,
            tier: UserTier.bronze,
            reputationScore: 0,
            createdAt: DateTime.utc(2026),
            lastLoginAt: DateTime.utc(2026),
          ),
        ),
        jwtProvider.overrideWith((ref) async => 'synthetic-preview-session'),
      ],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Synthetic comment conversation preview',
        theme: params['theme'] == 'dark'
            ? LythausTheme.dark()
            : LythausTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: const CommentThreadScreen(postId: _postId),
      ),
    ),
  );
}
