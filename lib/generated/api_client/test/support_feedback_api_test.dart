import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for SupportFeedbackApi
void main() {
  final instance = LythausApiClient().getSupportFeedbackApi();

  group(SupportFeedbackApi, () {
    // Read support form policy
    //
    // Authenticated member support options. The feature is default-off; a disabled feature returns 404. All responses are private and no-store.
    //
    //Future<SupportOptions> supportFeedbackOptions() async
    test('test supportFeedbackOptions', () async {
      // TODO
    });

    // Read a private problem report and public messages
    //
    //Future<MemberDetail> supportProblemDetail(String requestId, { int messageBefore }) async
    test('test supportProblemDetail', () async {
      // TODO
    });

    // List the member's private problem reports
    //
    //Future<MemberRequestPage> supportProblemList(int limit, { String cursor }) async
    test('test supportProblemList', () async {
      // TODO
    });

    // Reply to a private problem report
    //
    //Future<MemberMutationResult> supportProblemReply(String requestId, String idempotencyKey, ReplyRequest replyRequest) async
    test('test supportProblemReply', () async {
      // TODO
    });

    // Submit a private problem report
    //
    // Requires an Idempotency-Key. Evidence is not uploaded; only bounded request text is accepted. The report is visible to its submitter and authorized Lythaus owners.
    //
    //Future<MemberMutationResult> supportProblemSubmit(String idempotencyKey, ProblemSubmission problemSubmission) async
    test('test supportProblemSubmit', () async {
      // TODO
    });

    // Read a private suggestion and public messages
    //
    //Future<MemberDetail> supportSuggestionDetail(String requestId, { int messageBefore }) async
    test('test supportSuggestionDetail', () async {
      // TODO
    });

    // List the member's private suggestions
    //
    //Future<MemberRequestPage> supportSuggestionList(int limit, { String cursor }) async
    test('test supportSuggestionList', () async {
      // TODO
    });

    // Reply to a private suggestion
    //
    //Future<MemberMutationResult> supportSuggestionReply(String requestId, String idempotencyKey, ReplyRequest replyRequest) async
    test('test supportSuggestionReply', () async {
      // TODO
    });

    // Submit a private suggestion
    //
    // Requires an Idempotency-Key. The suggestion is visible to its submitter and authorized Lythaus owners.
    //
    //Future<MemberMutationResult> supportSuggestionSubmit(String idempotencyKey, SuggestionSubmission suggestionSubmission) async
    test('test supportSuggestionSubmit', () async {
      // TODO
    });

  });
}
