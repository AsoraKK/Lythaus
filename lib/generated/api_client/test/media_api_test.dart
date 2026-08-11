import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for MediaApi
void main() {
  final instance = LythausApiClient().getMediaApi();

  group(MediaApi, () {
    // Create a quarantined media upload session
    //
    // Creates a signed private upload session; the uploaded object remains quarantined until finalisation and review.
    //
    //Future<MediaUploadSessionCreated> mediaUploadsCreate(MediaUploadSessionCreateRequest mediaUploadSessionCreateRequest, { String idempotencyKey }) async
    test('test mediaUploadsCreate', () async {
      // TODO
    });

    // Finalise a quarantined media upload
    //
    // Verifies the uploaded object size and SHA-256 checksum, then queues private media review.
    //
    //Future<MediaUploadFinaliseResponse> mediaUploadsFinalise(String uploadSessionId, { String idempotencyKey }) async
    test('test mediaUploadsFinalise', () async {
      // TODO
    });

  });
}
