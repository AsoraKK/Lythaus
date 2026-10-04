# lythaus_api_client.api.AdminSupportFeedbackApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**adminSupportFeedbackOptions**](AdminSupportFeedbackApi.md#adminsupportfeedbackoptions) | **GET** /admin/support/options | Read owner support workflow policy
[**adminSupportProblemDecision**](AdminSupportFeedbackApi.md#adminsupportproblemdecision) | **POST** /admin/support/problems/{requestId}/decision | Change problem report state and send its public response
[**adminSupportProblemDetail**](AdminSupportFeedbackApi.md#adminsupportproblemdetail) | **GET** /admin/support/problems/{requestId} | Read owner problem report details and private triage records
[**adminSupportProblemEvidence**](AdminSupportFeedbackApi.md#adminsupportproblemevidence) | **POST** /admin/support/problems/{requestId}/evidence | Attach owner evidence to a problem report
[**adminSupportProblemNote**](AdminSupportFeedbackApi.md#adminsupportproblemnote) | **POST** /admin/support/problems/{requestId}/notes | Add a private owner note
[**adminSupportProblemQueue**](AdminSupportFeedbackApi.md#adminsupportproblemqueue) | **GET** /admin/support/problems | Queue private problem reports for owners
[**adminSupportProblemReply**](AdminSupportFeedbackApi.md#adminsupportproblemreply) | **POST** /admin/support/problems/{requestId}/messages | Send a public owner reply
[**adminSupportSuggestionDecision**](AdminSupportFeedbackApi.md#adminsupportsuggestiondecision) | **POST** /admin/support/suggestions/{requestId}/decision | Change suggestion state and send its public response
[**adminSupportSuggestionDetail**](AdminSupportFeedbackApi.md#adminsupportsuggestiondetail) | **GET** /admin/support/suggestions/{requestId} | Read owner suggestion details and private triage records
[**adminSupportSuggestionEvidence**](AdminSupportFeedbackApi.md#adminsupportsuggestionevidence) | **POST** /admin/support/suggestions/{requestId}/evidence | Attach owner evidence to a suggestion
[**adminSupportSuggestionNote**](AdminSupportFeedbackApi.md#adminsupportsuggestionnote) | **POST** /admin/support/suggestions/{requestId}/notes | Add a private owner note
[**adminSupportSuggestionQueue**](AdminSupportFeedbackApi.md#adminsupportsuggestionqueue) | **GET** /admin/support/suggestions | Queue private suggestions for owners
[**adminSupportSuggestionReply**](AdminSupportFeedbackApi.md#adminsupportsuggestionreply) | **POST** /admin/support/suggestions/{requestId}/messages | Send a public owner reply


# **adminSupportFeedbackOptions**
> SupportOptions adminSupportFeedbackOptions()

Read owner support workflow policy

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();

try {
    final response = api.adminSupportFeedbackOptions();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportFeedbackOptions: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**SupportOptions**](SupportOptions.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSupportProblemDecision**
> OwnerMutationResult adminSupportProblemDecision(requestId, idempotencyKey, ownerDecisionRequest)

Change problem report state and send its public response

Allowed transitions, terminal states, reason codes, and required evidence types are validated by the server policy. Closure requires same-request evidence where the policy requires it.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |
final OwnerDecisionRequest ownerDecisionRequest = ; // OwnerDecisionRequest |

try {
    final response = api.adminSupportProblemDecision(requestId, idempotencyKey, ownerDecisionRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportProblemDecision: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **idempotencyKey** | **String**|  |
 **ownerDecisionRequest** | [**OwnerDecisionRequest**](OwnerDecisionRequest.md)|  |

### Return type

[**OwnerMutationResult**](OwnerMutationResult.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSupportProblemDetail**
> OwnerDetail adminSupportProblemDetail(requestId, messageBefore, noteBefore, evidenceBefore, decisionBefore)

Read owner problem report details and private triage records

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final int messageBefore = 56; // int |
final int noteBefore = 56; // int |
final int evidenceBefore = 56; // int |
final int decisionBefore = 56; // int |

try {
    final response = api.adminSupportProblemDetail(requestId, messageBefore, noteBefore, evidenceBefore, decisionBefore);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportProblemDetail: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **messageBefore** | **int**|  | [optional]
 **noteBefore** | **int**|  | [optional]
 **evidenceBefore** | **int**|  | [optional]
 **decisionBefore** | **int**|  | [optional]

### Return type

[**OwnerDetail**](OwnerDetail.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSupportProblemEvidence**
> OwnerMutationResult adminSupportProblemEvidence(requestId, idempotencyKey, ownerEvidenceRequest)

Attach owner evidence to a problem report

Evidence is a bounded description and optional reference string, not an uploaded file. Evidence IDs are scoped to this request and decisions can cite only evidence attached to it.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |
final OwnerEvidenceRequest ownerEvidenceRequest = ; // OwnerEvidenceRequest |

try {
    final response = api.adminSupportProblemEvidence(requestId, idempotencyKey, ownerEvidenceRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportProblemEvidence: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **idempotencyKey** | **String**|  |
 **ownerEvidenceRequest** | [**OwnerEvidenceRequest**](OwnerEvidenceRequest.md)|  |

### Return type

[**OwnerMutationResult**](OwnerMutationResult.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSupportProblemNote**
> OwnerMutationResult adminSupportProblemNote(requestId, idempotencyKey, ownerNoteRequest)

Add a private owner note

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |
final OwnerNoteRequest ownerNoteRequest = ; // OwnerNoteRequest |

try {
    final response = api.adminSupportProblemNote(requestId, idempotencyKey, ownerNoteRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportProblemNote: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **idempotencyKey** | **String**|  |
 **ownerNoteRequest** | [**OwnerNoteRequest**](OwnerNoteRequest.md)|  |

### Return type

[**OwnerMutationResult**](OwnerMutationResult.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSupportProblemQueue**
> OwnerRequestPage adminSupportProblemQueue(limit, cursor)

Queue private problem reports for owners

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();
final int limit = 56; // int |
final String cursor = cursor_example; // String |

try {
    final response = api.adminSupportProblemQueue(limit, cursor);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportProblemQueue: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **limit** | **int**|  |
 **cursor** | **String**|  | [optional]

### Return type

[**OwnerRequestPage**](OwnerRequestPage.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSupportProblemReply**
> OwnerMutationResult adminSupportProblemReply(requestId, idempotencyKey, replyRequest)

Send a public owner reply

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |
final ReplyRequest replyRequest = ; // ReplyRequest |

try {
    final response = api.adminSupportProblemReply(requestId, idempotencyKey, replyRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportProblemReply: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **idempotencyKey** | **String**|  |
 **replyRequest** | [**ReplyRequest**](ReplyRequest.md)|  |

### Return type

[**OwnerMutationResult**](OwnerMutationResult.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSupportSuggestionDecision**
> OwnerMutationResult adminSupportSuggestionDecision(requestId, idempotencyKey, ownerDecisionRequest)

Change suggestion state and send its public response

Allowed transitions, terminal states, reason codes, and required evidence types are validated by the server policy. Closure requires same-request evidence where the policy requires it.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |
final OwnerDecisionRequest ownerDecisionRequest = ; // OwnerDecisionRequest |

try {
    final response = api.adminSupportSuggestionDecision(requestId, idempotencyKey, ownerDecisionRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportSuggestionDecision: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **idempotencyKey** | **String**|  |
 **ownerDecisionRequest** | [**OwnerDecisionRequest**](OwnerDecisionRequest.md)|  |

### Return type

[**OwnerMutationResult**](OwnerMutationResult.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSupportSuggestionDetail**
> OwnerDetail adminSupportSuggestionDetail(requestId, messageBefore, noteBefore, evidenceBefore, decisionBefore)

Read owner suggestion details and private triage records

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final int messageBefore = 56; // int |
final int noteBefore = 56; // int |
final int evidenceBefore = 56; // int |
final int decisionBefore = 56; // int |

try {
    final response = api.adminSupportSuggestionDetail(requestId, messageBefore, noteBefore, evidenceBefore, decisionBefore);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportSuggestionDetail: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **messageBefore** | **int**|  | [optional]
 **noteBefore** | **int**|  | [optional]
 **evidenceBefore** | **int**|  | [optional]
 **decisionBefore** | **int**|  | [optional]

### Return type

[**OwnerDetail**](OwnerDetail.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSupportSuggestionEvidence**
> OwnerMutationResult adminSupportSuggestionEvidence(requestId, idempotencyKey, ownerEvidenceRequest)

Attach owner evidence to a suggestion

Evidence is a bounded description and optional reference string, not an uploaded file. Evidence IDs are scoped to this request and decisions can cite only evidence attached to it.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |
final OwnerEvidenceRequest ownerEvidenceRequest = ; // OwnerEvidenceRequest |

try {
    final response = api.adminSupportSuggestionEvidence(requestId, idempotencyKey, ownerEvidenceRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportSuggestionEvidence: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **idempotencyKey** | **String**|  |
 **ownerEvidenceRequest** | [**OwnerEvidenceRequest**](OwnerEvidenceRequest.md)|  |

### Return type

[**OwnerMutationResult**](OwnerMutationResult.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSupportSuggestionNote**
> OwnerMutationResult adminSupportSuggestionNote(requestId, idempotencyKey, ownerNoteRequest)

Add a private owner note

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |
final OwnerNoteRequest ownerNoteRequest = ; // OwnerNoteRequest |

try {
    final response = api.adminSupportSuggestionNote(requestId, idempotencyKey, ownerNoteRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportSuggestionNote: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **idempotencyKey** | **String**|  |
 **ownerNoteRequest** | [**OwnerNoteRequest**](OwnerNoteRequest.md)|  |

### Return type

[**OwnerMutationResult**](OwnerMutationResult.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSupportSuggestionQueue**
> OwnerRequestPage adminSupportSuggestionQueue(limit, cursor)

Queue private suggestions for owners

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();
final int limit = 56; // int |
final String cursor = cursor_example; // String |

try {
    final response = api.adminSupportSuggestionQueue(limit, cursor);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportSuggestionQueue: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **limit** | **int**|  |
 **cursor** | **String**|  | [optional]

### Return type

[**OwnerRequestPage**](OwnerRequestPage.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSupportSuggestionReply**
> OwnerMutationResult adminSupportSuggestionReply(requestId, idempotencyKey, replyRequest)

Send a public owner reply

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |
final ReplyRequest replyRequest = ; // ReplyRequest |

try {
    final response = api.adminSupportSuggestionReply(requestId, idempotencyKey, replyRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminSupportFeedbackApi->adminSupportSuggestionReply: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **idempotencyKey** | **String**|  |
 **replyRequest** | [**ReplyRequest**](ReplyRequest.md)|  |

### Return type

[**OwnerMutationResult**](OwnerMutationResult.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
