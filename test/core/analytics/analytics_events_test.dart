import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('analytics event names are stable', () {
    expect(AnalyticsEvents.onboardingStart, 'onboarding_start');
    expect(AnalyticsEvents.authChoiceSelected, 'auth_choice_selected');
    expect(AnalyticsEvents.inviteScreenView, 'invite_screen_view');
    expect(AnalyticsEvents.inviteRedeemSuccess, 'invite_redeem_success');
    expect(AnalyticsEvents.inviteRedeemFail, 'invite_redeem_fail');
    expect(AnalyticsEvents.profileComplete, 'profile_complete');
    expect(AnalyticsEvents.firstFollow, 'first_follow');
    expect(AnalyticsEvents.firstPostAttempt, 'first_post_attempt');
    expect(AnalyticsEvents.firstPost, 'first_post');
    expect(AnalyticsEvents.feedFirstLoad, 'feed_first_load');
  });

  test('invite redeem failure reasons map to snake case', () {
    expect(InviteRedeemFailureReason.invalidCode.value, 'invalid_code');
    expect(InviteRedeemFailureReason.expired.value, 'expired');
    expect(InviteRedeemFailureReason.alreadyUsed.value, 'already_used');
    expect(InviteRedeemFailureReason.exhausted.value, 'exhausted');
    expect(InviteRedeemFailureReason.revoked.value, 'revoked');
    expect(InviteRedeemFailureReason.emailMismatch.value, 'email_mismatch');
    expect(InviteRedeemFailureReason.alreadyActive.value, 'already_active');
    expect(InviteRedeemFailureReason.missingEmail.value, 'missing_email');
    expect(InviteRedeemFailureReason.invalidRequest.value, 'invalid_request');
    expect(InviteRedeemFailureReason.unauthorized.value, 'unauthorized');
    expect(InviteRedeemFailureReason.rateLimited.value, 'rate_limited');
    expect(InviteRedeemFailureReason.network.value, 'network');
    expect(InviteRedeemFailureReason.unknown.value, 'unknown');
  });
}
