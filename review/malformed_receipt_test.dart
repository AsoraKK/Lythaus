import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/feed/application/post_repository_impl.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';

class _Dio extends Mock implements Dio {}

void main() {
  for (final entry in <String, Map<String, dynamic>>{
    'missing id': {'body': 'synthetic draft'},
    'null id': {'id': null, 'body': 'synthetic draft'},
    'empty id': {'id': '', 'body': 'synthetic draft'},
  }.entries) {
    test('I-02 malformed creation receipt: ${entry.key}', () async {
      final dio = _Dio();
      when(() => dio.post<Map<String, dynamic>>(
        '/api/posts', data: any(named: 'data'), options: any(named: 'options'),
      )).thenAnswer((_) async => Response<Map<String, dynamic>>(
        data: entry.value, statusCode: 201,
        requestOptions: RequestOptions(path: '/api/posts'),
      ));
      final result = await PostRepositoryImpl(dio).createPost(
        request: const CreatePostRequest(text: 'synthetic draft', idempotencyKey: 'synthetic-fixed-key'),
        token: 'synthetic-local-token',
      );
      expect(result, isA<CreatePostError>());
      expect((result as CreatePostError).outcomeUncertain, isTrue);
    });
  }
}
