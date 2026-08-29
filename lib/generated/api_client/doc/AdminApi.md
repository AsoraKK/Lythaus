# lythaus_api_client.api.AdminApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**adminAppealsAdjudicate**](AdminApi.md#adminappealsadjudicate) | **POST** /admin/appeals/{appealId}/adjudications | Record a trained editorial appeal adjudication
[**adminAppealsPendingAdjudicationList**](AdminApi.md#adminappealspendingadjudicationlist) | **GET** /admin/appeals/pending-adjudication | List pending appeal adjudications
[**adminAuthSummary**](AdminApi.md#adminauthsummary) | **GET** /admin/auth/summary | Read live authentication summary
[**adminEditorialPublicationsCreate**](AdminApi.md#admineditorialpublicationscreate) | **POST** /admin/editorial/publications | Publish an editorial News Board entry
[**adminEmailHealth**](AdminApi.md#adminemailhealth) | **GET** /admin/email-health | Read transactional email health
[**adminHealth**](AdminApi.md#adminhealth) | **GET** /admin/health | Check admin Worker health
[**adminLegalHoldsClear**](AdminApi.md#adminlegalholdsclear) | **POST** /admin/privacy/legal-holds/{holdId}/clear | Clear a legal hold
[**adminLegalHoldsCreate**](AdminApi.md#adminlegalholdscreate) | **POST** /admin/privacy/legal-holds | Place a legal hold
[**adminLegalHoldsList**](AdminApi.md#adminlegalholdslist) | **GET** /admin/privacy/legal-holds | List active and released legal holds
[**adminModerationCasesList**](AdminApi.md#adminmoderationcaseslist) | **GET** /admin/moderation/cases | List moderation cases
[**adminModerationDecision**](AdminApi.md#adminmoderationdecision) | **POST** /admin/moderation/cases/{caseId}/decision | Apply a moderation decision
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
[**productIntegrityAdminAuditList**](AdminApi.md#productintegrityadminauditlist) | **GET** /admin/audit | List admin audit events
[**productIntegrityAdminUsersSearch**](AdminApi.md#productintegrityadminuserssearch) | **GET** /admin/users/search | Search users


# **adminAppealsAdjudicate**
> AppealAdjudicationResponse adminAppealsAdjudicate(appealId, appealAdjudicationRequest)

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
final String appealId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AppealAdjudicationRequest appealAdjudicationRequest = {"decision":"uphold","reasonCode":"APPEAL.PANEL_CONFIRMED"}; // AppealAdjudicationRequest |

try {
    final response = api.adminAppealsAdjudicate(appealId, appealAdjudicationRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAppealsAdjudicate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
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

# **adminEditorialPublicationsCreate**
> EditorialPublicationResponse adminEditorialPublicationsCreate(editorialPublicationCreate)

Publish an editorial News Board entry

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final EditorialPublicationCreate editorialPublicationCreate = ; // EditorialPublicationCreate |

try {
    final response = api.adminEditorialPublicationsCreate(editorialPublicationCreate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminEditorialPublicationsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
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
> LegalHoldResponse adminLegalHoldsClear(holdId)

Clear a legal hold

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String holdId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.adminLegalHoldsClear(holdId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminLegalHoldsClear: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **holdId** | **String**|  |

### Return type

[**LegalHoldResponse**](LegalHoldResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminLegalHoldsCreate**
> LegalHoldResponse adminLegalHoldsCreate(legalHoldCreate)

Place a legal hold

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final LegalHoldCreate legalHoldCreate = ; // LegalHoldCreate |

try {
    final response = api.adminLegalHoldsCreate(legalHoldCreate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminLegalHoldsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
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
> ModerationDecisionResponse adminModerationDecision(caseId, moderationDecisionRequest)

Apply a moderation decision

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ModerationDecisionRequest moderationDecisionRequest = ; // ModerationDecisionRequest |

try {
    final response = api.adminModerationDecision(caseId, moderationDecisionRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminModerationDecision: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
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
> ReviewerQualificationResponse adminReviewerQualificationCreate(reviewerId, reviewerQualificationUpdateRequest)

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
final String reviewerId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ReviewerQualificationUpdateRequest reviewerQualificationUpdateRequest = ; // ReviewerQualificationUpdateRequest |

try {
    final response = api.adminReviewerQualificationCreate(reviewerId, reviewerQualificationUpdateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminReviewerQualificationCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
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
> ReviewerQualificationResponse adminReviewerQualificationUpdate(reviewerId, reviewerQualificationUpdateRequest)

Idempotently set reviewer qualification state

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String reviewerId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ReviewerQualificationUpdateRequest reviewerQualificationUpdateRequest = ; // ReviewerQualificationUpdateRequest |

try {
    final response = api.adminReviewerQualificationUpdate(reviewerId, reviewerQualificationUpdateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminReviewerQualificationUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
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
> AccountStatusResponse adminUsersStatusUpdate(userId, accountStatusUpdate)

Update account status

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String userId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AccountStatusUpdate accountStatusUpdate = ; // AccountStatusUpdate |

try {
    final response = api.adminUsersStatusUpdate(userId, accountStatusUpdate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUsersStatusUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
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
> AccountTierResponse adminUsersTierUpdate(userId, accountTierUpdate)

Update subscription tier

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String userId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AccountTierUpdate accountTierUpdate = ; // AccountTierUpdate |

try {
    final response = api.adminUsersTierUpdate(userId, accountTierUpdate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUsersTierUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
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
