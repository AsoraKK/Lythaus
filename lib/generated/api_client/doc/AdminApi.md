# lythaus_api_client.api.AdminApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**adminAccountSupportAccess**](AdminApi.md#adminaccountsupportaccess) | **GET** /admin/account-support/access | Check owner account-support access
[**adminAccountSupportHistory**](AdminApi.md#adminaccountsupporthistory) | **POST** /admin/account-support/users/{userId}/history | Read partial recorded account history
[**adminAccountSupportLookup**](AdminApi.md#adminaccountsupportlookup) | **POST** /admin/account-support/lookup | Read minimum account state by exact email
[**adminActivityMeasurement**](AdminApi.md#adminactivitymeasurement) | **GET** /admin/activity-measurement | Read bounded owner-only consenting-cohort activity metrics
[**adminAppealsAdjudicate**](AdminApi.md#adminappealsadjudicate) | **POST** /admin/appeals/{appealId}/adjudications | Record a trained editorial appeal adjudication
[**adminAppealsPendingAdjudicationList**](AdminApi.md#adminappealspendingadjudicationlist) | **GET** /admin/appeals/pending-adjudication | List pending appeal adjudications
[**adminAuthSummary**](AdminApi.md#adminauthsummary) | **GET** /admin/auth/summary | Read live authentication summary
[**adminAuthenticityBetaRetry**](AdminApi.md#adminauthenticitybetaretry) | **POST** /admin/authenticity/cases/{caseId}/retry | Resume bounded unfinished work
[**adminAuthenticityBetaReview**](AdminApi.md#adminauthenticitybetareview) | **POST** /admin/authenticity/cases/{caseId}/review | Record a versioned non-enforcing review
[**adminCommunityAppealsEvidence**](AdminApi.md#admincommunityappealsevidence) | **GET** /admin/appeals/{appealId}/evidence | Read frozen evidence for safe triage
[**adminCommunityAppealsQueue**](AdminApi.md#admincommunityappealsqueue) | **GET** /admin/appeals/community/queue | List appeals awaiting safe triage or accountable follow-up
[**adminCommunityAppealsTriage**](AdminApi.md#admincommunityappealstriage) | **POST** /admin/appeals/{appealId}/triage | Freeze a safe review packet or restrict a submitted appeal
[**adminEditorialPublicationsCreate**](AdminApi.md#admineditorialpublicationscreate) | **POST** /admin/editorial/publications | Publish an editorial News Board entry
[**adminEmailHealth**](AdminApi.md#adminemailhealth) | **GET** /admin/email-health | Read transactional email health
[**adminHealth**](AdminApi.md#adminhealth) | **GET** /admin/health | Check admin Worker health
[**adminLegalHoldsClear**](AdminApi.md#adminlegalholdsclear) | **POST** /admin/privacy/legal-holds/{holdId}/clear | Clear a legal hold
[**adminLegalHoldsCreate**](AdminApi.md#adminlegalholdscreate) | **POST** /admin/privacy/legal-holds | Place a legal hold
[**adminLegalHoldsList**](AdminApi.md#adminlegalholdslist) | **GET** /admin/privacy/legal-holds | List active and released legal holds
[**adminModerationCasesList**](AdminApi.md#adminmoderationcaseslist) | **GET** /admin/moderation/cases | List moderation cases
[**adminModerationDecision**](AdminApi.md#adminmoderationdecision) | **POST** /admin/moderation/cases/{caseId}/decision | Apply a moderation decision
[**adminMonthlyContextReview**](AdminApi.md#adminmonthlycontextreview) | **POST** /admin/reputation/comments/{commentId}/context-review | Record a scoped contextual contribution review
[**adminOverview**](AdminApi.md#adminoverview) | **GET** /admin/overview | Read bounded owner-only community aggregates
[**adminPrivacyRequestsList**](AdminApi.md#adminprivacyrequestslist) | **GET** /admin/privacy/requests | List privacy requests
[**adminReviewerQualificationCreate**](AdminApi.md#adminreviewerqualificationcreate) | **POST** /admin/reviewers/{reviewerId}/qualification | Set reviewer qualification state
[**adminReviewerQualificationUpdate**](AdminApi.md#adminreviewerqualificationupdate) | **PUT** /admin/reviewers/{reviewerId}/qualification | Idempotently set reviewer qualification state
[**adminUserDelete**](AdminApi.md#adminuserdelete) | **DELETE** /admin/users/{userId} | Request controlled account deletion
[**adminUserDetail**](AdminApi.md#adminuserdetail) | **GET** /admin/users/{userId} | Read a user and account activity
[**adminUserInvite**](AdminApi.md#adminuserinvite) | **POST** /admin/users | Invite a new email account
[**adminUserProfilePatch**](AdminApi.md#adminuserprofilepatch) | **PATCH** /admin/users/{userId} | Edit a user profile
[**adminUserResendVerification**](AdminApi.md#adminuserresendverification) | **POST** /admin/users/{userId}/resend-verification | Request a new verification message
[**adminUserRevokeSessions**](AdminApi.md#adminuserrevokesessions) | **POST** /admin/users/{userId}/revoke-sessions | Revoke all active sessions
[**adminUsersList**](AdminApi.md#adminuserslist) | **GET** /admin/users | List users with keyset pagination
[**adminUsersStatusUpdate**](AdminApi.md#adminusersstatusupdate) | **POST** /admin/users/{userId}/status | Update account status
[**adminUsersTierUpdate**](AdminApi.md#adminuserstierupdate) | **POST** /admin/users/{userId}/tier | Update subscription tier
[**adminWaitlistCreate**](AdminApi.md#adminwaitlistcreate) | **POST** /admin/waitlist | Add a waitlist signup
[**adminWaitlistDelete**](AdminApi.md#adminwaitlistdelete) | **DELETE** /admin/waitlist/{waitlistId} | Retire a waitlist signup
[**adminWaitlistList**](AdminApi.md#adminwaitlistlist) | **GET** /admin/waitlist | List private beta waitlist signups
[**adminWaitlistPatch**](AdminApi.md#adminwaitlistpatch) | **PATCH** /admin/waitlist/{waitlistId} | Edit a waitlist signup
[**adminWaitlistRetentionHoldUpdate**](AdminApi.md#adminwaitlistretentionholdupdate) | **POST** /admin/waitlist/{waitlistId}/retention-hold | Set a waitlist retention hold
[**adminWaitlistStatusUpdate**](AdminApi.md#adminwaitliststatusupdate) | **POST** /admin/waitlist/{waitlistId}/status | Update a waitlist signup status
[**getAdminAuthenticityBetaCase**](AdminApi.md#getadminauthenticitybetacase) | **GET** /admin/authenticity/cases/{caseId} | Read audited diagnostics and review history
[**getAdminAuthenticityBetaImage**](AdminApi.md#getadminauthenticitybetaimage) | **GET** /admin/authenticity/cases/{caseId}/image | Read the audited private display derivative
[**getAdminAuthenticityPrivateAlphaCase**](AdminApi.md#getadminauthenticityprivatealphacase) | **GET** /admin/authenticity/alpha/cases/{caseId} | Read private alpha diagnostics
[**getAdminAuthenticityPrivateAlphaImage**](AdminApi.md#getadminauthenticityprivatealphaimage) | **GET** /admin/authenticity/alpha/cases/{caseId}/image | Read a quarantined private alpha image
[**listAdminAuthenticityBetaCases**](AdminApi.md#listadminauthenticitybetacases) | **GET** /admin/authenticity/cases | List private beta review cases
[**listAdminAuthenticityPrivateAlphaCases**](AdminApi.md#listadminauthenticityprivatealphacases) | **GET** /admin/authenticity/alpha/cases | List private alpha cases for authorized administrators
[**productIntegrityAdminAuditList**](AdminApi.md#productintegrityadminauditlist) | **GET** /admin/audit | List admin audit events
[**productIntegrityAdminUsersSearch**](AdminApi.md#productintegrityadminuserssearch) | **GET** /admin/users/search | Search users
[**requestAdminAuthenticityBetaAdvice**](AdminApi.md#requestadminauthenticitybetaadvice) | **POST** /admin/authenticity/cases/{caseId}/advice | Request one bounded explanation of eligible persisted evidence
[**requestAdminAuthenticityPrivateAlphaAdvice**](AdminApi.md#requestadminauthenticityprivatealphaadvice) | **POST** /admin/authenticity/alpha/cases/{caseId}/advice | Request one bounded private alpha explanation
[**reviewAdminAuthenticityPrivateAlphaCase**](AdminApi.md#reviewadminauthenticityprivatealphacase) | **POST** /admin/authenticity/alpha/cases/{caseId}/review | Record an administrator private alpha review


# **adminAccountSupportAccess**
> AccountSupportAccess adminAccountSupportAccess()

Check owner account-support access

Requires verified Cloudflare Access and an active owner membership joined to an active owner account. Returns no account records. Every lookup and history request checks authorization independently.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminAccountSupportAccess();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAccountSupportAccess: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AccountSupportAccess**](AccountSupportAccess.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAccountSupportHistory**
> AccountSupportHistoryResponse adminAccountSupportHistory(userId, accountSupportHistoryRequest)

Read partial recorded account history

Owner-only, audited read with an allowed Origin and a reason code. Unions recorded account, activity and target-user audit events. Returns safe event codes and timestamps, excluding metadata and private content. Identity account events have no recorded correlation IDs. Missing storage, query or audit evidence returns unavailable rather than an empty success. Filters and pagination are in a bounded JSON body; URL parameters are rejected. This operation changes only the support audit, not account state.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String userId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AccountSupportHistoryRequest accountSupportHistoryRequest = {"reasonCode":"SUPPORT_REQUEST","order":"oldest","limit":25}; // AccountSupportHistoryRequest |

try {
    final response = api.adminAccountSupportHistory(userId, accountSupportHistoryRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAccountSupportHistory: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **userId** | **String**|  |
 **accountSupportHistoryRequest** | [**AccountSupportHistoryRequest**](AccountSupportHistoryRequest.md)|  |

### Return type

[**AccountSupportHistoryResponse**](AccountSupportHistoryResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAccountSupportLookup**
> AccountSupportLookupResponse adminAccountSupportLookup(accountSupportLookupRequest)

Read minimum account state by exact email

Owner-only read, using an exact trimmed and case-normalized email. Email is accepted only in a bounded JSON body, never a URL parameter. Requires an allowed Origin and a reason code. An audit must commit before disclosure. Ambiguous matches disclose no account state. Passwords, tokens, reset links, email values and private content are excluded. This operation changes only the support audit, not account state.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final AccountSupportLookupRequest accountSupportLookupRequest = {"email":"synthetic@example.invalid","reasonCode":"SUPPORT_REQUEST"}; // AccountSupportLookupRequest |

try {
    final response = api.adminAccountSupportLookup(accountSupportLookupRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAccountSupportLookup: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **accountSupportLookupRequest** | [**AccountSupportLookupRequest**](AccountSupportLookupRequest.md)|  |

### Return type

[**AccountSupportLookupResponse**](AccountSupportLookupResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminActivityMeasurement**
> ActivitySummary adminActivityMeasurement()

Read bounded owner-only consenting-cohort activity metrics

Verified Access, current active owner membership, existing rate limit and committed audit are mandatory. Completed UTC days only; cohorts must have continuous consent throughout each window. Nonconsenting and pre-cutover populations are not reconstructed. Quiet requires observed prior-30-day activity and no recent-30-day activity with complete 60-day coverage. No raw dates or identities; no unmatched contributor ratios. Disabled, zero-cohort, stale, capped and missing coverage states do not become measured zero.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminActivityMeasurement();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminActivityMeasurement: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**ActivitySummary**](ActivitySummary.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAppealsAdjudicate**
> AppealAdjudicationResponse adminAppealsAdjudicate(origin, appealId, appealAdjudicationRequest)

Record a trained editorial appeal adjudication

This never auto-resolves an appeal. The shared governance policy evaluates the independently assigned reviewer quorum and then requires one trained adjudicator for standard risk or two for high risk. The outcome is applied only when the returned status is resolved.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String origin = origin_example; // String | Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it.
final String appealId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AppealAdjudicationRequest appealAdjudicationRequest = {"decision":"uphold","reasonCode":"APPEAL.PANEL_CONFIRMED"}; // AppealAdjudicationRequest |

try {
    final response = api.adminAppealsAdjudicate(origin, appealId, appealAdjudicationRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAppealsAdjudicate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it. | [default to 'https://admin.lythaus.co']
 **appealId** | **String**|  |
 **appealAdjudicationRequest** | [**AppealAdjudicationRequest**](AppealAdjudicationRequest.md)|  |

### Return type

[**AppealAdjudicationResponse**](AppealAdjudicationResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAppealsPendingAdjudicationList**
> PendingAppealAdjudicationList adminAppealsPendingAdjudicationList()

List pending appeal adjudications

Editorial, administrator, and owner roles may list independent appeals awaiting adjudication. Only trained editorial adjudicators may record an adjudication.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminAppealsPendingAdjudicationList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAppealsPendingAdjudicationList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**PendingAppealAdjudicationList**](PendingAppealAdjudicationList.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAuthSummary**
> AdminAuthSummary adminAuthSummary()

Read live authentication summary

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminAuthSummary();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAuthSummary: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AdminAuthSummary**](AdminAuthSummary.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAuthenticityBetaRetry**
> BetaActionResponse adminAuthenticityBetaRetry(caseId, betaFeedback)

Resume bounded unfinished work

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final BetaFeedback betaFeedback = ; // BetaFeedback |

try {
    final response = api.adminAuthenticityBetaRetry(caseId, betaFeedback);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAuthenticityBetaRetry: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **betaFeedback** | [**BetaFeedback**](BetaFeedback.md)|  |

### Return type

[**BetaActionResponse**](BetaActionResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAuthenticityBetaReview**
> BetaActionResponse adminAuthenticityBetaReview(caseId, betaFeedback)

Record a versioned non-enforcing review

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final BetaFeedback betaFeedback = ; // BetaFeedback |

try {
    final response = api.adminAuthenticityBetaReview(caseId, betaFeedback);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAuthenticityBetaReview: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **betaFeedback** | [**BetaFeedback**](BetaFeedback.md)|  |

### Return type

[**BetaActionResponse**](BetaActionResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminCommunityAppealsEvidence**
> CommunityAppealTriageEvidence adminCommunityAppealsEvidence(appealId)

Read frozen evidence for safe triage

Active conflict-free moderation staff only. No ballots or live tally. Restricted material requires a separately approved specialist route and is refused by this endpoint.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String appealId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.adminCommunityAppealsEvidence(appealId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminCommunityAppealsEvidence: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **appealId** | **String**|  |

### Return type

[**CommunityAppealTriageEvidence**](CommunityAppealTriageEvidence.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminCommunityAppealsQueue**
> CommunityAppealTriageQueue adminCommunityAppealsQueue()

List appeals awaiting safe triage or accountable follow-up

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminCommunityAppealsQueue();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminCommunityAppealsQueue: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**CommunityAppealTriageQueue**](CommunityAppealTriageQueue.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminCommunityAppealsTriage**
> CommunityAppealTriageResponse adminCommunityAppealsTriage(appealId, communityAppealTriageRequest)

Freeze a safe review packet or restrict a submitted appeal

Active conflict-free moderation staff provide a safe text rendition and rule context. The review clock starts here. Requires approved rules and the active feature flag. This operation cannot alter a community outcome or reopen a triaged packet.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String appealId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final CommunityAppealTriageRequest communityAppealTriageRequest = ; // CommunityAppealTriageRequest |

try {
    final response = api.adminCommunityAppealsTriage(appealId, communityAppealTriageRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminCommunityAppealsTriage: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **appealId** | **String**|  |
 **communityAppealTriageRequest** | [**CommunityAppealTriageRequest**](CommunityAppealTriageRequest.md)|  |

### Return type

[**CommunityAppealTriageResponse**](CommunityAppealTriageResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminEditorialPublicationsCreate**
> EditorialPublicationResponse adminEditorialPublicationsCreate(origin, editorialPublicationCreate)

Publish an editorial News Board entry

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String origin = origin_example; // String | Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it.
final EditorialPublicationCreate editorialPublicationCreate = ; // EditorialPublicationCreate |

try {
    final response = api.adminEditorialPublicationsCreate(origin, editorialPublicationCreate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminEditorialPublicationsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it. | [default to 'https://admin.lythaus.co']
 **editorialPublicationCreate** | [**EditorialPublicationCreate**](EditorialPublicationCreate.md)|  |

### Return type

[**EditorialPublicationResponse**](EditorialPublicationResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminEmailHealth**
> AdminEmailHealth adminEmailHealth()

Read transactional email health

Provider lifecycle is reported from canonical relay state; unavailable lifecycle evidence is surfaced as unknown.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminEmailHealth();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminEmailHealth: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AdminEmailHealth**](AdminEmailHealth.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminHealth**
> AdminHealth adminHealth()

Check admin Worker health

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminHealth();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminHealth: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AdminHealth**](AdminHealth.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminLegalHoldsClear**
> LegalHoldResponse adminLegalHoldsClear(origin, holdId, requestBody)

Clear a legal hold

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String origin = origin_example; // String | Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it.
final String holdId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final BuiltMap<String, JsonObject> requestBody = {}; // BuiltMap<String, JsonObject> | Optional JSON object; clearing uses holdId and does not require a body. The JSON Content-Type header is required even when the body is absent.

try {
    final response = api.adminLegalHoldsClear(origin, holdId, requestBody);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminLegalHoldsClear: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it. | [default to 'https://admin.lythaus.co']
 **holdId** | **String**|  |
 **requestBody** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md)| Optional JSON object; clearing uses holdId and does not require a body. The JSON Content-Type header is required even when the body is absent. | [optional]

### Return type

[**LegalHoldResponse**](LegalHoldResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminLegalHoldsCreate**
> LegalHoldResponse adminLegalHoldsCreate(origin, legalHoldCreate)

Place a legal hold

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String origin = origin_example; // String | Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it.
final LegalHoldCreate legalHoldCreate = ; // LegalHoldCreate |

try {
    final response = api.adminLegalHoldsCreate(origin, legalHoldCreate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminLegalHoldsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it. | [default to 'https://admin.lythaus.co']
 **legalHoldCreate** | [**LegalHoldCreate**](LegalHoldCreate.md)|  |

### Return type

[**LegalHoldResponse**](LegalHoldResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminLegalHoldsList**
> AdminItems adminLegalHoldsList()

List active and released legal holds

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminLegalHoldsList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminLegalHoldsList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AdminItems**](AdminItems.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminModerationCasesList**
> AdminItems adminModerationCasesList()

List moderation cases

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminModerationCasesList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminModerationCasesList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AdminItems**](AdminItems.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminModerationDecision**
> ModerationDecisionResponse adminModerationDecision(origin, caseId, moderationDecisionRequest)

Apply a moderation decision

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String origin = origin_example; // String | Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it.
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ModerationDecisionRequest moderationDecisionRequest = ; // ModerationDecisionRequest |

try {
    final response = api.adminModerationDecision(origin, caseId, moderationDecisionRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminModerationDecision: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it. | [default to 'https://admin.lythaus.co']
 **caseId** | **String**|  |
 **moderationDecisionRequest** | [**ModerationDecisionRequest**](ModerationDecisionRequest.md)|  |

### Return type

[**ModerationDecisionResponse**](ModerationDecisionResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminMonthlyContextReview**
> MonthlyContextReviewResponse adminMonthlyContextReview(commentId, monthlyContextReviewRequest)

Record a scoped contextual contribution review

Requires a verified Cloudflare Access JWT, active owner, administrator, or moderator membership authorised for this review, and an allowed Origin. The handler binds the reviewer to the current comment, thread and parent revisions. Actor identity and rules version come from server context. evidenceReference is a caller-supplied bounded opaque string stored as supplied; the API does not validate its target or sensitivity. Do not include raw content or secrets; this value is omitted from the response. The request cannot submit points. The route remains unavailable until its separate configuration and collection gates are enabled.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String commentId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final MonthlyContextReviewRequest monthlyContextReviewRequest = ; // MonthlyContextReviewRequest |

try {
    final response = api.adminMonthlyContextReview(commentId, monthlyContextReviewRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminMonthlyContextReview: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **commentId** | **String**|  |
 **monthlyContextReviewRequest** | [**MonthlyContextReviewRequest**](MonthlyContextReviewRequest.md)|  |

### Return type

[**MonthlyContextReviewResponse**](MonthlyContextReviewResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminOverview**
> AdminOverview adminOverview(period)

Read bounded owner-only community aggregates

Verified Access, current active owner membership and account, existing rate limits and a committed audit are required. No user identities or content are returned. UTC half-open calendar windows compare matching elapsed prior periods only. Current retained visibility and deletion state apply to both windows. Table populations above the bounded snapshot cap are unavailable, not partial totals. Empty post cohorts have no ratio. No provider polling, billing estimate or payment inference is enabled.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String period = period_example; // String |

try {
    final response = api.adminOverview(period);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminOverview: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **period** | **String**|  | [optional] [default to 'today']

### Return type

[**AdminOverview**](AdminOverview.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminPrivacyRequestsList**
> AdminItems adminPrivacyRequestsList()

List privacy requests

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminPrivacyRequestsList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminPrivacyRequestsList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AdminItems**](AdminItems.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminReviewerQualificationCreate**
> ReviewerQualificationResponse adminReviewerQualificationCreate(origin, reviewerId, reviewerQualificationUpdateRequest)

Set reviewer qualification state

Compatibility method for the idempotent qualification update. Reviewer training remains separate from reputation level.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String origin = origin_example; // String | Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it.
final String reviewerId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ReviewerQualificationUpdateRequest reviewerQualificationUpdateRequest = ; // ReviewerQualificationUpdateRequest |

try {
    final response = api.adminReviewerQualificationCreate(origin, reviewerId, reviewerQualificationUpdateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminReviewerQualificationCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it. | [default to 'https://admin.lythaus.co']
 **reviewerId** | **String**|  |
 **reviewerQualificationUpdateRequest** | [**ReviewerQualificationUpdateRequest**](ReviewerQualificationUpdateRequest.md)|  |

### Return type

[**ReviewerQualificationResponse**](ReviewerQualificationResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminReviewerQualificationUpdate**
> ReviewerQualificationResponse adminReviewerQualificationUpdate(origin, reviewerId, reviewerQualificationUpdateRequest)

Idempotently set reviewer qualification state

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String origin = origin_example; // String | Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it.
final String reviewerId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ReviewerQualificationUpdateRequest reviewerQualificationUpdateRequest = ; // ReviewerQualificationUpdateRequest |

try {
    final response = api.adminReviewerQualificationUpdate(origin, reviewerId, reviewerQualificationUpdateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminReviewerQualificationUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it. | [default to 'https://admin.lythaus.co']
 **reviewerId** | **String**|  |
 **reviewerQualificationUpdateRequest** | [**ReviewerQualificationUpdateRequest**](ReviewerQualificationUpdateRequest.md)|  |

### Return type

[**ReviewerQualificationResponse**](ReviewerQualificationResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUserDelete**
> AdminUserDeletionResponse adminUserDelete(userId, idempotencyKey, adminMutationConfirmation)

Request controlled account deletion

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String userId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed.
final AdminMutationConfirmation adminMutationConfirmation = ; // AdminMutationConfirmation |

try {
    final response = api.adminUserDelete(userId, idempotencyKey, adminMutationConfirmation);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUserDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **userId** | **String**|  |
 **idempotencyKey** | **String**| Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. |
 **adminMutationConfirmation** | [**AdminMutationConfirmation**](AdminMutationConfirmation.md)|  |

### Return type

[**AdminUserDeletionResponse**](AdminUserDeletionResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUserDetail**
> AdminUserDetail200Response adminUserDetail(userId)

Read a user and account activity

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String userId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.adminUserDetail(userId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUserDetail: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **userId** | **String**|  |

### Return type

[**AdminUserDetail200Response**](AdminUserDetail200Response.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUserInvite**
> AdminUserMutationResponse adminUserInvite(adminUserInvite)

Invite a new email account

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final AdminUserInvite adminUserInvite = ; // AdminUserInvite |

try {
    final response = api.adminUserInvite(adminUserInvite);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUserInvite: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **adminUserInvite** | [**AdminUserInvite**](AdminUserInvite.md)|  |

### Return type

[**AdminUserMutationResponse**](AdminUserMutationResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUserProfilePatch**
> AdminUserMutationResponse adminUserProfilePatch(userId, adminUserProfilePatch)

Edit a user profile

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String userId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AdminUserProfilePatch adminUserProfilePatch = ; // AdminUserProfilePatch |

try {
    final response = api.adminUserProfilePatch(userId, adminUserProfilePatch);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUserProfilePatch: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **userId** | **String**|  |
 **adminUserProfilePatch** | [**AdminUserProfilePatch**](AdminUserProfilePatch.md)|  |

### Return type

[**AdminUserMutationResponse**](AdminUserMutationResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUserResendVerification**
> adminUserResendVerification(userId, adminMutationConfirmation)

Request a new verification message

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String userId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AdminMutationConfirmation adminMutationConfirmation = ; // AdminMutationConfirmation |

try {
    api.adminUserResendVerification(userId, adminMutationConfirmation);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUserResendVerification: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **userId** | **String**|  |
 **adminMutationConfirmation** | [**AdminMutationConfirmation**](AdminMutationConfirmation.md)|  |

### Return type

void (empty response body)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUserRevokeSessions**
> adminUserRevokeSessions(userId, adminMutationConfirmation)

Revoke all active sessions

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String userId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AdminMutationConfirmation adminMutationConfirmation = ; // AdminMutationConfirmation |

try {
    api.adminUserRevokeSessions(userId, adminMutationConfirmation);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUserRevokeSessions: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **userId** | **String**|  |
 **adminMutationConfirmation** | [**AdminMutationConfirmation**](AdminMutationConfirmation.md)|  |

### Return type

void (empty response body)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUsersList**
> AdminUserPage adminUsersList(q, status, source_, createdAfter, createdBefore, cursor, limit)

List users with keyset pagination

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String q = q_example; // String |
final String status = status_example; // String |
final String source_ = source__example; // String |
final DateTime createdAfter = 2013-10-20T19:20:30+01:00; // DateTime |
final DateTime createdBefore = 2013-10-20T19:20:30+01:00; // DateTime |
final String cursor = cursor_example; // String | Opaque keyset cursor returned by the preceding page.
final int limit = 56; // int |

try {
    final response = api.adminUsersList(q, status, source_, createdAfter, createdBefore, cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUsersList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **q** | **String**|  | [optional]
 **status** | **String**|  | [optional]
 **source_** | **String**|  | [optional]
 **createdAfter** | **DateTime**|  | [optional]
 **createdBefore** | **DateTime**|  | [optional]
 **cursor** | **String**| Opaque keyset cursor returned by the preceding page. | [optional]
 **limit** | **int**|  | [optional] [default to 25]

### Return type

[**AdminUserPage**](AdminUserPage.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUsersStatusUpdate**
> AccountStatusResponse adminUsersStatusUpdate(origin, userId, accountStatusUpdate)

Update account status

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String origin = origin_example; // String | Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it.
final String userId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AccountStatusUpdate accountStatusUpdate = ; // AccountStatusUpdate |

try {
    final response = api.adminUsersStatusUpdate(origin, userId, accountStatusUpdate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUsersStatusUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it. | [default to 'https://admin.lythaus.co']
 **userId** | **String**|  |
 **accountStatusUpdate** | [**AccountStatusUpdate**](AccountStatusUpdate.md)|  |

### Return type

[**AccountStatusResponse**](AccountStatusResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUsersTierUpdate**
> AccountTierResponse adminUsersTierUpdate(origin, userId, accountTierUpdate)

Update subscription tier

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String origin = origin_example; // String | Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it.
final String userId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AccountTierUpdate accountTierUpdate = ; // AccountTierUpdate |

try {
    final response = api.adminUsersTierUpdate(origin, userId, accountTierUpdate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUsersTierUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Must equal the request URL origin and an approved configured admin origin. Browsers supply their actual origin; approved direct clients must provide it. | [default to 'https://admin.lythaus.co']
 **userId** | **String**|  |
 **accountTierUpdate** | [**AccountTierUpdate**](AccountTierUpdate.md)|  |

### Return type

[**AccountTierResponse**](AccountTierResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminWaitlistCreate**
> WaitlistStatusResponse adminWaitlistCreate(adminWaitlistCreate)

Add a waitlist signup

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final AdminWaitlistCreate adminWaitlistCreate = ; // AdminWaitlistCreate |

try {
    final response = api.adminWaitlistCreate(adminWaitlistCreate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminWaitlistCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **adminWaitlistCreate** | [**AdminWaitlistCreate**](AdminWaitlistCreate.md)|  |

### Return type

[**WaitlistStatusResponse**](WaitlistStatusResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminWaitlistDelete**
> WaitlistStatusResponse adminWaitlistDelete(waitlistId, idempotencyKey, adminMutationConfirmation)

Retire a waitlist signup

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String waitlistId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed.
final AdminMutationConfirmation adminMutationConfirmation = ; // AdminMutationConfirmation |

try {
    final response = api.adminWaitlistDelete(waitlistId, idempotencyKey, adminMutationConfirmation);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminWaitlistDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **waitlistId** | **String**|  |
 **idempotencyKey** | **String**| Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. |
 **adminMutationConfirmation** | [**AdminMutationConfirmation**](AdminMutationConfirmation.md)|  |

### Return type

[**WaitlistStatusResponse**](WaitlistStatusResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminWaitlistList**
> WaitlistAdminResponse adminWaitlistList(cursor, limit)

List private beta waitlist signups

Administrator-only PII access. Every successful view is written to the admin audit log.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String cursor = cursor_example; // String |
final int limit = 56; // int |

try {
    final response = api.adminWaitlistList(cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminWaitlistList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**|  | [optional]
 **limit** | **int**|  | [optional] [default to 50]

### Return type

[**WaitlistAdminResponse**](WaitlistAdminResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminWaitlistPatch**
> WaitlistStatusResponse adminWaitlistPatch(waitlistId, adminWaitlistPatch)

Edit a waitlist signup

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String waitlistId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AdminWaitlistPatch adminWaitlistPatch = ; // AdminWaitlistPatch |

try {
    final response = api.adminWaitlistPatch(waitlistId, adminWaitlistPatch);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminWaitlistPatch: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **waitlistId** | **String**|  |
 **adminWaitlistPatch** | [**AdminWaitlistPatch**](AdminWaitlistPatch.md)|  |

### Return type

[**WaitlistStatusResponse**](WaitlistStatusResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminWaitlistRetentionHoldUpdate**
> WaitlistRetentionHoldResponse adminWaitlistRetentionHoldUpdate(waitlistId, waitlistRetentionHoldUpdate)

Set a waitlist retention hold

Administrator and owner roles may set or release a retention hold. The response contains no email or encrypted-email fields.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String waitlistId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final WaitlistRetentionHoldUpdate waitlistRetentionHoldUpdate = ; // WaitlistRetentionHoldUpdate |

try {
    final response = api.adminWaitlistRetentionHoldUpdate(waitlistId, waitlistRetentionHoldUpdate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminWaitlistRetentionHoldUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **waitlistId** | **String**|  |
 **waitlistRetentionHoldUpdate** | [**WaitlistRetentionHoldUpdate**](WaitlistRetentionHoldUpdate.md)|  |

### Return type

[**WaitlistRetentionHoldResponse**](WaitlistRetentionHoldResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminWaitlistStatusUpdate**
> WaitlistStatusResponse adminWaitlistStatusUpdate(waitlistId, waitlistStatusUpdate)

Update a waitlist signup status

Administrator and owner roles may update a waitlist record status. The response never includes email lookup or ciphertext fields.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String waitlistId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final WaitlistStatusUpdate waitlistStatusUpdate = ; // WaitlistStatusUpdate |

try {
    final response = api.adminWaitlistStatusUpdate(waitlistId, waitlistStatusUpdate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminWaitlistStatusUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **waitlistId** | **String**|  |
 **waitlistStatusUpdate** | [**WaitlistStatusUpdate**](WaitlistStatusUpdate.md)|  |

### Return type

[**WaitlistStatusResponse**](WaitlistStatusResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getAdminAuthenticityBetaCase**
> BetaAdminCase getAdminAuthenticityBetaCase(caseId)

Read audited diagnostics and review history

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.getAdminAuthenticityBetaCase(caseId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->getAdminAuthenticityBetaCase: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |

### Return type

[**BetaAdminCase**](BetaAdminCase.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getAdminAuthenticityBetaImage**
> Uint8List getAdminAuthenticityBetaImage(caseId)

Read the audited private display derivative

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.getAdminAuthenticityBetaImage(caseId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->getAdminAuthenticityBetaImage: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |

### Return type

[**Uint8List**](Uint8List.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: image/png, application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getAdminAuthenticityPrivateAlphaCase**
> AlphaAdminCase getAdminAuthenticityPrivateAlphaCase(caseId)

Read private alpha diagnostics

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.getAdminAuthenticityPrivateAlphaCase(caseId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->getAdminAuthenticityPrivateAlphaCase: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |

### Return type

[**AlphaAdminCase**](AlphaAdminCase.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getAdminAuthenticityPrivateAlphaImage**
> getAdminAuthenticityPrivateAlphaImage(caseId)

Read a quarantined private alpha image

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    api.getAdminAuthenticityPrivateAlphaImage(caseId);
} catch on DioException (e) {
    print('Exception when calling AdminApi->getAdminAuthenticityPrivateAlphaImage: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |

### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: image/png, image/jpeg, application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listAdminAuthenticityBetaCases**
> BetaCaseList listAdminAuthenticityBetaCases()

List private beta review cases

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.listAdminAuthenticityBetaCases();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->listAdminAuthenticityBetaCases: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**BetaCaseList**](BetaCaseList.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listAdminAuthenticityPrivateAlphaCases**
> AlphaAdminCaseList listAdminAuthenticityPrivateAlphaCases()

List private alpha cases for authorized administrators

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.listAdminAuthenticityPrivateAlphaCases();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->listAdminAuthenticityPrivateAlphaCases: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AlphaAdminCaseList**](AlphaAdminCaseList.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **productIntegrityAdminAuditList**
> AdminItems productIntegrityAdminAuditList()

List admin audit events

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.productIntegrityAdminAuditList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->productIntegrityAdminAuditList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AdminItems**](AdminItems.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **productIntegrityAdminUsersSearch**
> AdminItems productIntegrityAdminUsersSearch(q)

Search users

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String q = q_example; // String |

try {
    final response = api.productIntegrityAdminUsersSearch(q);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->productIntegrityAdminUsersSearch: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **q** | **String**|  |

### Return type

[**AdminItems**](AdminItems.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **requestAdminAuthenticityBetaAdvice**
> BetaActionResponse requestAdminAuthenticityBetaAdvice(caseId, betaFeedback)

Request one bounded explanation of eligible persisted evidence

Privileged, audited request. Requires supported successful SAFE evidence and selective escalation, an unconsumed adviser attempt, a current lease/admission budget and unexpired case. Uses the existing outbox. Does not rerun SAFE or Safety, change the deterministic finding, or publish content.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final BetaFeedback betaFeedback = ; // BetaFeedback |

try {
    final response = api.requestAdminAuthenticityBetaAdvice(caseId, betaFeedback);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->requestAdminAuthenticityBetaAdvice: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **betaFeedback** | [**BetaFeedback**](BetaFeedback.md)|  |

### Return type

[**BetaActionResponse**](BetaActionResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **requestAdminAuthenticityPrivateAlphaAdvice**
> AlphaAction requestAdminAuthenticityPrivateAlphaAdvice(caseId, alphaFeedback)

Request one bounded private alpha explanation

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AlphaFeedback alphaFeedback = ; // AlphaFeedback |

try {
    final response = api.requestAdminAuthenticityPrivateAlphaAdvice(caseId, alphaFeedback);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->requestAdminAuthenticityPrivateAlphaAdvice: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **alphaFeedback** | [**AlphaFeedback**](AlphaFeedback.md)|  |

### Return type

[**AlphaAction**](AlphaAction.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **reviewAdminAuthenticityPrivateAlphaCase**
> AlphaAction reviewAdminAuthenticityPrivateAlphaCase(caseId, alphaFeedback)

Record an administrator private alpha review

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AlphaFeedback alphaFeedback = ; // AlphaFeedback |

try {
    final response = api.reviewAdminAuthenticityPrivateAlphaCase(caseId, alphaFeedback);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->reviewAdminAuthenticityPrivateAlphaCase: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **alphaFeedback** | [**AlphaFeedback**](AlphaFeedback.md)|  |

### Return type

[**AlphaAction**](AlphaAction.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
