import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for ActivityApi
void main() {
  final instance = LythausApiClient().getActivityApi();

  group(ActivityApi, () {
    // List my auditable activity
    //
    //Future<ActivityPage> activityList({ String cursor, int limit, String category }) async
    test('test activityList', () async {
      // TODO
    });

    // List my auditable activity
    //
    // Compatibility alias for `/activity`.
    //
    //Future<ActivityPage> activityListLegacy({ String cursor, int limit, String category }) async
    test('test activityListLegacy', () async {
      // TODO
    });

    // Get my private profile
    //
    //Future<ProductIntegrityPrivateProfileResponse> productIntegrityProfileGetMe() async
    test('test productIntegrityProfileGetMe', () async {
      // TODO
    });

    // Update my private profile
    //
    //Future<ProductIntegrityPrivateProfileResponse> productIntegrityProfileReplaceMe(ProductIntegrityProfileUpdateRequest productIntegrityProfileUpdateRequest, { String idempotencyKey }) async
    test('test productIntegrityProfileReplaceMe', () async {
      // TODO
    });

    // Partially update my private profile
    //
    //Future<ProductIntegrityPrivateProfileResponse> productIntegrityProfileUpdateMe(ProductIntegrityProfileUpdateRequest productIntegrityProfileUpdateRequest, { String idempotencyKey }) async
    test('test productIntegrityProfileUpdateMe', () async {
      // TODO
    });

  });
}
