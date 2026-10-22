import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for MediaApi
void main() {
  final instance = LythausApiClient().getMediaApi();

  group(MediaApi, () {
    // Create a quarantined media upload session
    //
    // Creates a private upload session and returns an authenticated Worker route. The response includes no object key or reusable R2 signature.
    //
    //Future<MediaUploadSessionCreated> mediaUploadsCreate(MediaUploadSessionCreateRequest mediaUploadSessionCreateRequest, { String idempotencyKey }) async
    test('test mediaUploadsCreate', () async {
      // TODO
    });

    // Finalise a quarantined media upload
    //
    // Verifies the uploaded object size and SHA-256 checksum, then queues private media review. A repeated finalisation of an already queued or processed session returns its original private queued receipt when the canonical event remains available. This receipt does not certify safety, authenticity or publication eligibility.
    //
    //Future<MediaUploadFinaliseResponse> mediaUploadsFinalise(String uploadSessionId, { String idempotencyKey }) async
    test('test mediaUploadsFinalise', () async {
      // TODO
    });

    // Read private upload processing status
    //
    // Owner-only, no-store status. Completed integrity processing remains private review; safety and authenticity have not run and publication is not allowed.
    //
    //Future<MediaUploadStatus> mediaUploadsGetStatus(String uploadSessionId) async
    test('test mediaUploadsGetStatus', () async {
      // TODO
    });

    // Upload bytes to a private session
    //
    // Rechecks the active owner and pending session, bounds the body before R2, and verifies exact size, SHA-256 and MIME before storing bytes in quarantine.
    //
    //Future<MediaUploadBytesResponse> mediaUploadsPutBytes(String uploadSessionId, MultipartFile body) async
    test('test mediaUploadsPutBytes', () async {
      // TODO
    });

  });
}
