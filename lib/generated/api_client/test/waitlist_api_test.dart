import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for WaitlistApi
void main() {
  final instance = LythausApiClient().getWaitlistApi();

  group(WaitlistApi, () {
    // Join the Lythaus private beta waitlist
    //
    // Returns the same neutral success response for new and duplicate submissions.
    //
    //Future<WaitlistSuccess> joinWaitlist(WaitlistSubmission waitlistSubmission) async
    test('test joinWaitlist', () async {
      // TODO
    });

  });
}
