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
[**appealsGet**](AppealsApi.md#appealsget) | **GET** /appeals/{id} | Get an appeal visible to its appellant or assigned reviewer
[**appealsRecuse**](AppealsApi.md#appealsrecuse) | **POST** /appeals/{appealId}/recuse | Publicly record reviewer recusal
[**appealsVote**](AppealsApi.md#appealsvote) | **POST** /appeals/{appealId}/vote | Submit one immutable reviewer vote


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

The case determines standard or high risk; the service assigns independent trained reviewers.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAppealsApi();
final AppealCreateRequest appealCreateRequest = ; // AppealCreateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

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
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

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

Get an appeal visible to its appellant or assigned reviewer

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
final String idempotencyKey = idempotencyKey_example; // String | Required replay key for an immutable reviewer vote.

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
 **idempotencyKey** | **String**| Required replay key for an immutable reviewer vote. |

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

Submit one immutable reviewer vote

Only an independently assigned trained reviewer may vote. A vote is locked and cannot be changed.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAppealsApi();
final String appealId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Required replay key for an immutable reviewer vote.
final GovernanceAppealVoteRequest governanceAppealVoteRequest = ; // GovernanceAppealVoteRequest |

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
 **idempotencyKey** | **String**| Required replay key for an immutable reviewer vote. |
 **governanceAppealVoteRequest** | [**GovernanceAppealVoteRequest**](GovernanceAppealVoteRequest.md)|  |

### Return type

[**GovernanceAppealVoteResponse**](GovernanceAppealVoteResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
