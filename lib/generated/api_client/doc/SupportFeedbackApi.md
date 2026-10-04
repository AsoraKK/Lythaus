# lythaus_api_client.api.SupportFeedbackApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**supportFeedbackOptions**](SupportFeedbackApi.md#supportfeedbackoptions) | **GET** /support/options | Read support form policy
[**supportProblemDetail**](SupportFeedbackApi.md#supportproblemdetail) | **GET** /support/problems/{requestId} | Read a private problem report and public messages
[**supportProblemList**](SupportFeedbackApi.md#supportproblemlist) | **GET** /support/problems | List the member&#39;s private problem reports
[**supportProblemReply**](SupportFeedbackApi.md#supportproblemreply) | **POST** /support/problems/{requestId}/messages | Reply to a private problem report
[**supportProblemSubmit**](SupportFeedbackApi.md#supportproblemsubmit) | **POST** /support/problems | Submit a private problem report
[**supportSuggestionDetail**](SupportFeedbackApi.md#supportsuggestiondetail) | **GET** /support/suggestions/{requestId} | Read a private suggestion and public messages
[**supportSuggestionList**](SupportFeedbackApi.md#supportsuggestionlist) | **GET** /support/suggestions | List the member&#39;s private suggestions
[**supportSuggestionReply**](SupportFeedbackApi.md#supportsuggestionreply) | **POST** /support/suggestions/{requestId}/messages | Reply to a private suggestion
[**supportSuggestionSubmit**](SupportFeedbackApi.md#supportsuggestionsubmit) | **POST** /support/suggestions | Submit a private suggestion


# **supportFeedbackOptions**
> SupportOptions supportFeedbackOptions()

Read support form policy

Authenticated member support options. The feature is default-off; a disabled feature returns 404. All responses are private and no-store.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSupportFeedbackApi();

try {
    final response = api.supportFeedbackOptions();
    print(response);
} catch on DioException (e) {
    print('Exception when calling SupportFeedbackApi->supportFeedbackOptions: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**SupportOptions**](SupportOptions.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **supportProblemDetail**
> MemberDetail supportProblemDetail(requestId, messageBefore)

Read a private problem report and public messages

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final int messageBefore = 56; // int |

try {
    final response = api.supportProblemDetail(requestId, messageBefore);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SupportFeedbackApi->supportProblemDetail: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **messageBefore** | **int**|  | [optional]

### Return type

[**MemberDetail**](MemberDetail.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **supportProblemList**
> MemberRequestPage supportProblemList(limit, cursor)

List the member's private problem reports

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSupportFeedbackApi();
final int limit = 56; // int |
final String cursor = cursor_example; // String |

try {
    final response = api.supportProblemList(limit, cursor);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SupportFeedbackApi->supportProblemList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **limit** | **int**|  |
 **cursor** | **String**|  | [optional]

### Return type

[**MemberRequestPage**](MemberRequestPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **supportProblemReply**
> MemberMutationResult supportProblemReply(requestId, idempotencyKey, replyRequest)

Reply to a private problem report

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |
final ReplyRequest replyRequest = ; // ReplyRequest |

try {
    final response = api.supportProblemReply(requestId, idempotencyKey, replyRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SupportFeedbackApi->supportProblemReply: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **idempotencyKey** | **String**|  |
 **replyRequest** | [**ReplyRequest**](ReplyRequest.md)|  |

### Return type

[**MemberMutationResult**](MemberMutationResult.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **supportProblemSubmit**
> MemberMutationResult supportProblemSubmit(idempotencyKey, problemSubmission)

Submit a private problem report

Requires an Idempotency-Key. Evidence is not uploaded; only bounded request text is accepted. The report is visible to its submitter and authorized Lythaus owners.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSupportFeedbackApi();
final String idempotencyKey = idempotencyKey_example; // String |
final ProblemSubmission problemSubmission = ; // ProblemSubmission |

try {
    final response = api.supportProblemSubmit(idempotencyKey, problemSubmission);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SupportFeedbackApi->supportProblemSubmit: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **idempotencyKey** | **String**|  |
 **problemSubmission** | [**ProblemSubmission**](ProblemSubmission.md)|  |

### Return type

[**MemberMutationResult**](MemberMutationResult.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **supportSuggestionDetail**
> MemberDetail supportSuggestionDetail(requestId, messageBefore)

Read a private suggestion and public messages

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final int messageBefore = 56; // int |

try {
    final response = api.supportSuggestionDetail(requestId, messageBefore);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SupportFeedbackApi->supportSuggestionDetail: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **messageBefore** | **int**|  | [optional]

### Return type

[**MemberDetail**](MemberDetail.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **supportSuggestionList**
> MemberRequestPage supportSuggestionList(limit, cursor)

List the member's private suggestions

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSupportFeedbackApi();
final int limit = 56; // int |
final String cursor = cursor_example; // String |

try {
    final response = api.supportSuggestionList(limit, cursor);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SupportFeedbackApi->supportSuggestionList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **limit** | **int**|  |
 **cursor** | **String**|  | [optional]

### Return type

[**MemberRequestPage**](MemberRequestPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **supportSuggestionReply**
> MemberMutationResult supportSuggestionReply(requestId, idempotencyKey, replyRequest)

Reply to a private suggestion

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSupportFeedbackApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |
final ReplyRequest replyRequest = ; // ReplyRequest |

try {
    final response = api.supportSuggestionReply(requestId, idempotencyKey, replyRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SupportFeedbackApi->supportSuggestionReply: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |
 **idempotencyKey** | **String**|  |
 **replyRequest** | [**ReplyRequest**](ReplyRequest.md)|  |

### Return type

[**MemberMutationResult**](MemberMutationResult.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **supportSuggestionSubmit**
> MemberMutationResult supportSuggestionSubmit(idempotencyKey, suggestionSubmission)

Submit a private suggestion

Requires an Idempotency-Key. The suggestion is visible to its submitter and authorized Lythaus owners.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSupportFeedbackApi();
final String idempotencyKey = idempotencyKey_example; // String |
final SuggestionSubmission suggestionSubmission = ; // SuggestionSubmission |

try {
    final response = api.supportSuggestionSubmit(idempotencyKey, suggestionSubmission);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SupportFeedbackApi->supportSuggestionSubmit: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **idempotencyKey** | **String**|  |
 **suggestionSubmission** | [**SuggestionSubmission**](SuggestionSubmission.md)|  |

### Return type

[**MemberMutationResult**](MemberMutationResult.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
