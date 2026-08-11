import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for ModerationApi
void main() {
  final instance = LythausApiClient().getModerationApi();

  group(ModerationApi, () {
    // Submit a moderation flag
    //
    // Equivalent flag submission route for content-focused clients.
    //
    //Future<FlagCreateResponse> contentFlagsCreate(FlagCreateRequest flagCreateRequest, { String idempotencyKey }) async
    test('test contentFlagsCreate', () async {
      // TODO
    });

    // Submit a moderation flag
    //
    // Records a neutral report for moderation review. Flags are evidence, not a public finding.
    //
    //Future<FlagCreateResponse> flagsCreate(FlagCreateRequest flagCreateRequest, { String idempotencyKey }) async
    test('test flagsCreate', () async {
      // TODO
    });

  });
}
