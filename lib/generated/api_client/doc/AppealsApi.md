# lythaus_api_client.api.AppealsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**adminAppealsPendingAdjudicationList**](AppealsApi.md#adminappealspendingadjudicationlist) | **GET** /admin/appeals/pending-adjudication | List pending appeal adjudications
[**adminReviewerQualificationCreate**](AppealsApi.md#adminreviewerqualificationcreate) | **POST** /admin/reviewers/{reviewerId}/qualification | Set reviewer qualification state
[**adminReviewerQualificationUpdate**](AppealsApi.md#adminreviewerqualificationupdate) | **PUT** /admin/reviewers/{reviewerId}/qualification | Idempotently set reviewer qualification state
[**appealReviewerAssignmentsList**](AppealsApi.md#appealreviewerassignmentslist) | **GET** /appeals/reviewer/assignments | List my appeal-review assignments
[**appealsCreate**](AppealsApi.md#appealscreate) | **POST** /appeals | Submit an appeal
[**appealsGet**](AppealsApi.md#appealsget) | **GET** /appeals/{id} | Get a private appeal under its recorded policy
[**appealsRecuse**](AppealsApi.md#appealsrecuse) | **POST** /appeals/{appealId}/recuse | Publicly record reviewer recusal
[**appealsVote**](AppealsApi.md#appealsvote) | **POST** /appeals/{appealId}/vote | Record a ballot under the case policy
[**communityAppealsQueue**](AppealsApi.md#communityappealsqueue) | **GET** /appeals/review/queue | List private eligible community reviews
[**communityAppealsWithdraw**](AppealsApi.md#communityappealswithdraw) | **POST** /appeals/{appealId}/withdraw | Withdraw an owned community appeal before closure


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

final api = LythausApiClient().getAppealsApi();

try {
    final response = api.adminAppealsPendingAdjudicationList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->adminAppealsPendingAdjudicationList: $e\n');
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

final api = LythausApiClient().getAppealsApi();
final String reviewerId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ReviewerQualificationUpdateRequest reviewerQualificationUpdateRequest = ; // ReviewerQualificationUpdateRequest |

try {
    final response = api.adminReviewerQualificationCreate(reviewerId, reviewerQualificationUpdateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->adminReviewerQualificationCreate: $e\n');
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

final api = LythausApiClient().getAppealsApi();
final String reviewerId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ReviewerQualificationUpdateRequest reviewerQualificationUpdateRequest = ; // ReviewerQualificationUpdateRequest |

try {
    final response = api.adminReviewerQualificationUpdate(reviewerId, reviewerQualificationUpdateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->adminReviewerQualificationUpdate: $e\n');
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

# **appealReviewerAssignmentsList**
> AppealReviewerAssignments appealReviewerAssignmentsList()

List my appeal-review assignments

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAppealsApi();

try {
    final response = api.appealReviewerAssignmentsList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->appealReviewerAssignmentsList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AppealReviewerAssignments**](AppealReviewerAssignments.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **appealsCreate**
> AppealCreateResponse appealsCreate(appealCreateRequest, idempotencyKey)

Submit an appeal

Dispatches by the activated policy. Monthly-policy cases await safe evidence triage before timed equal-vote community review. Historical cases retain their labelled assignment policy. Unapproved community configuration returns 503.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAppealsApi();
final AppealCreateRequest appealCreateRequest = {"caseId":"018b27d4-6e1e-7bd3-bb5a-98f24bb968c2","statement":"I believe this decision should be reviewed because the context was misunderstood."}; // AppealCreateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.appealsCreate(appealCreateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->appealsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **appealCreateRequest** | [**AppealCreateRequest**](AppealCreateRequest.md)|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**AppealCreateResponse**](AppealCreateResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **appealsGet**
> AppealDetailResponse appealsGet(id)

Get a private appeal under its recorded policy

Monthly-policy peers receive only safe evidence and their own ballot. Restricted cases are visible only to their appellant without an evidence preview. Live totals and voter identities are never returned. Historical assigned-reviewer access is preserved.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAppealsApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.appealsGet(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->appealsGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**AppealDetailResponse**](AppealDetailResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **appealsRecuse**
> AppealRecusalResponse appealsRecuse(appealId, idempotencyKey)

Publicly record reviewer recusal

Only an independently assigned reviewer may recuse an open appeal. The assigned state becomes recused and the review cannot be restored by this endpoint.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAppealsApi();
final String appealId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed.

try {
    final response = api.appealsRecuse(appealId, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->appealsRecuse: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **appealId** | **String**|  |
 **idempotencyKey** | **String**| Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. |

### Return type

[**AppealRecusalResponse**](AppealRecusalResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **appealsVote**
> GovernanceAppealVoteResponse appealsVote(appealId, idempotencyKey, governanceAppealVoteRequest)

Record a ballot under the case policy

Monthly-policy ballots have weight one for every eligible email-verified member and use an expected revision; configured changes stop at the server deadline. Historical cases accept the original immutable assigned-reviewer vote. No live totals or other voter identities are returned.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAppealsApi();
final String appealId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed.
final GovernanceAppealVoteRequest governanceAppealVoteRequest = {"decision":"overturn"}; // GovernanceAppealVoteRequest |

try {
    final response = api.appealsVote(appealId, idempotencyKey, governanceAppealVoteRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->appealsVote: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **appealId** | **String**|  |
 **idempotencyKey** | **String**| Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. |
 **governanceAppealVoteRequest** | [**GovernanceAppealVoteRequest**](GovernanceAppealVoteRequest.md)|  |

### Return type

[**GovernanceAppealVoteResponse**](GovernanceAppealVoteResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **communityAppealsQueue**
> CommunityAppealQueue communityAppealsQueue()

List private eligible community reviews

Random case ordering; no selected panel, live counts, voter identities or restricted evidence. Requires approved configuration and a verified eligible account. No suitable cases returns no_case_available.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAppealsApi();

try {
    final response = api.communityAppealsQueue();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->communityAppealsQueue: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**CommunityAppealQueue**](CommunityAppealQueue.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **communityAppealsWithdraw**
> CommunityAppealWithdrawal communityAppealsWithdraw(appealId, idempotencyKey)

Withdraw an owned community appeal before closure

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAppealsApi();
final String appealId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.communityAppealsWithdraw(appealId, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->communityAppealsWithdraw: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **appealId** | **String**|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**CommunityAppealWithdrawal**](CommunityAppealWithdrawal.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
