// ignore_for_file: public_member_api_docs
import 'package:dio/dio.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';

Future<Map<String, dynamic>> readOwnerContent({
  required Dio dio,
  required String kind,
  required String id,
  required String actor,
  required String token,
}) async {
  final response = await dio.get<Map<String, dynamic>>(
    '/api/${kind == 'post' ? 'posts' : 'comments'}/$id/owner-view',
    options: Options(headers: {'Authorization': 'Bearer $token'}),
  );
  final data = contentResponsePayload(response.data);
  if (data['id'] != id ||
      data['authorId'] != actor ||
      data['deleted'] == true ||
      data['body'] is! String ||
      !['allowed', 'under_review'].contains(data['moderationState']) ||
      !['human', 'ai_assisted'].contains(data['declaredCreationMode'])) {
    throw const ContentMutationFailure(
      'Your content is unavailable.',
      uncertain: false,
    );
  }
  return data;
}
