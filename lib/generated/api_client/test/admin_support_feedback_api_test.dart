import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';


/// tests for AdminSupportFeedbackApi
void main() {
  final instance = LythausApiClient().getAdminSupportFeedbackApi();

  group(AdminSupportFeedbackApi, () {
    // Read owner support workflow policy
    //
    //Future<SupportOptions> adminSupportFeedbackOptions() async
    test('test adminSupportFeedbackOptions', () async {
      // TODO
    });

    // Change problem report state and send its public response
    //
    // Allowed transitions, terminal states, reason codes, and required evidence types are validated by the server policy. Closure requires same-request evidence where the policy requires it.
    //
    //Future<OwnerMutationResult> adminSupportProblemDecision(String requestId, String idempotencyKey, OwnerDecisionRequest ownerDecisionRequest) async
    test('test adminSupportProblemDecision', () async {
      // TODO
    });

    // Read owner problem report details and private triage records
    //
    //Future<OwnerDetail> adminSupportProblemDetail(String requestId, { int messageBefore, int noteBefore, int evidenceBefore, int decisionBefore }) async
    test('test adminSupportProblemDetail', () async {
      // TODO
    });

    // Attach owner evidence to a problem report
    //
    // Evidence is a bounded description and optional reference string, not an uploaded file. Evidence IDs are scoped to this request and decisions can cite only evidence attached to it.
    //
    //Future<OwnerMutationResult> adminSupportProblemEvidence(String requestId, String idempotencyKey, OwnerEvidenceRequest ownerEvidenceRequest) async
    test('test adminSupportProblemEvidence', () async {
      // TODO
    });

    // Add a private owner note
    //
    //Future<OwnerMutationResult> adminSupportProblemNote(String requestId, String idempotencyKey, OwnerNoteRequest ownerNoteRequest) async
    test('test adminSupportProblemNote', () async {
      // TODO
    });

    // Queue private problem reports for owners
    //
    //Future<OwnerRequestPage> adminSupportProblemQueue(int limit, { String cursor }) async
    test('test adminSupportProblemQueue', () async {
      // TODO
    });

    // Send a public owner reply
    //
    //Future<OwnerMutationResult> adminSupportProblemReply(String requestId, String idempotencyKey, ReplyRequest replyRequest) async
    test('test adminSupportProblemReply', () async {
      // TODO
    });

    // Change suggestion state and send its public response
    //
    // Allowed transitions, terminal states, reason codes, and required evidence types are validated by the server policy. Closure requires same-request evidence where the policy requires it.
    //
    //Future<OwnerMutationResult> adminSupportSuggestionDecision(String requestId, String idempotencyKey, OwnerDecisionRequest ownerDecisionRequest) async
    test('test adminSupportSuggestionDecision', () async {
      // TODO
    });

    // Read owner suggestion details and private triage records
    //
    //Future<OwnerDetail> adminSupportSuggestionDetail(String requestId, { int messageBefore, int noteBefore, int evidenceBefore, int decisionBefore }) async
    test('test adminSupportSuggestionDetail', () async {
      // TODO
    });

    // Attach owner evidence to a suggestion
    //
    // Evidence is a bounded description and optional reference string, not an uploaded file. Evidence IDs are scoped to this request and decisions can cite only evidence attached to it.
    //
    //Future<OwnerMutationResult> adminSupportSuggestionEvidence(String requestId, String idempotencyKey, OwnerEvidenceRequest ownerEvidenceRequest) async
    test('test adminSupportSuggestionEvidence', () async {
      // TODO
    });

    // Add a private owner note
    //
    //Future<OwnerMutationResult> adminSupportSuggestionNote(String requestId, String idempotencyKey, OwnerNoteRequest ownerNoteRequest) async
    test('test adminSupportSuggestionNote', () async {
      // TODO
    });

    // Queue private suggestions for owners
    //
    //Future<OwnerRequestPage> adminSupportSuggestionQueue(int limit, { String cursor }) async
    test('test adminSupportSuggestionQueue', () async {
      // TODO
    });

    // Send a public owner reply
    //
    //Future<OwnerMutationResult> adminSupportSuggestionReply(String requestId, String idempotencyKey, ReplyRequest replyRequest) async
    test('test adminSupportSuggestionReply', () async {
      // TODO
    });

  });
}
