# lythaus_api_client.api.ReactionsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**commentContributionEmotionSet**](ReactionsApi.md#commentcontributionemotionset) | **PUT** /feedback/comment/{targetId}/emotion | Set or remove emotion feedback on a comment
[**commentContributionFeedbackGet**](ReactionsApi.md#commentcontributionfeedbackget) | **GET** /feedback/comment/{targetId} | Read separate quality and emotional feedback for a comment
[**commentContributionQualitySet**](ReactionsApi.md#commentcontributionqualityset) | **PUT** /feedback/comment/{targetId}/quality | Set or remove quality feedback on a comment
[**postContributionEmotionSet**](ReactionsApi.md#postcontributionemotionset) | **PUT** /feedback/post/{targetId}/emotion | Set or remove emotion feedback on a post
[**postContributionFeedbackGet**](ReactionsApi.md#postcontributionfeedbackget) | **GET** /feedback/post/{targetId} | Read separate quality and emotional feedback for a post
[**postContributionQualitySet**](ReactionsApi.md#postcontributionqualityset) | **PUT** /feedback/post/{targetId}/quality | Set or remove quality feedback on a post


# **commentContributionEmotionSet**
> ContributionFeedbackChange commentContributionEmotionSet(targetId, idempotencyKey, emotionFeedbackRequest)

Set or remove emotion feedback on a comment

Authenticated readers may set one independent value per channel and target. A null value removes that channel; feedback does not change reputation or rewards. Returns 404 while disabled.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReactionsApi();
final String targetId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Reuse the same key to retry an identical change safely.
final EmotionFeedbackRequest emotionFeedbackRequest = ; // EmotionFeedbackRequest |

try {
    final response = api.commentContributionEmotionSet(targetId, idempotencyKey, emotionFeedbackRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReactionsApi->commentContributionEmotionSet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **targetId** | **String**|  |
 **idempotencyKey** | **String**| Reuse the same key to retry an identical change safely. |
 **emotionFeedbackRequest** | [**EmotionFeedbackRequest**](EmotionFeedbackRequest.md)|  |

### Return type

[**ContributionFeedbackChange**](ContributionFeedbackChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **commentContributionFeedbackGet**
> ContributionFeedbackSummary commentContributionFeedbackGet(targetId)

Read separate quality and emotional feedback for a comment

Public visitors can read visible targets; authenticated readers receive their own values and block/mute filtered counts. Returns 404 while this feature is disabled.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReactionsApi();
final String targetId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.commentContributionFeedbackGet(targetId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReactionsApi->commentContributionFeedbackGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **targetId** | **String**|  |

### Return type

[**ContributionFeedbackSummary**](ContributionFeedbackSummary.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **commentContributionQualitySet**
> ContributionFeedbackChange commentContributionQualitySet(targetId, idempotencyKey, qualityFeedbackRequest)

Set or remove quality feedback on a comment

Authenticated readers may set one independent value per channel and target. A null value removes that channel; feedback does not change reputation or rewards. Returns 404 while disabled.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReactionsApi();
final String targetId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Reuse the same key to retry an identical change safely.
final QualityFeedbackRequest qualityFeedbackRequest = ; // QualityFeedbackRequest |

try {
    final response = api.commentContributionQualitySet(targetId, idempotencyKey, qualityFeedbackRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReactionsApi->commentContributionQualitySet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **targetId** | **String**|  |
 **idempotencyKey** | **String**| Reuse the same key to retry an identical change safely. |
 **qualityFeedbackRequest** | [**QualityFeedbackRequest**](QualityFeedbackRequest.md)|  |

### Return type

[**ContributionFeedbackChange**](ContributionFeedbackChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postContributionEmotionSet**
> ContributionFeedbackChange postContributionEmotionSet(targetId, idempotencyKey, emotionFeedbackRequest)

Set or remove emotion feedback on a post

Authenticated readers may set one independent value per channel and target. A null value removes that channel; feedback does not change reputation or rewards. Returns 404 while disabled.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReactionsApi();
final String targetId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Reuse the same key to retry an identical change safely.
final EmotionFeedbackRequest emotionFeedbackRequest = ; // EmotionFeedbackRequest |

try {
    final response = api.postContributionEmotionSet(targetId, idempotencyKey, emotionFeedbackRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReactionsApi->postContributionEmotionSet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **targetId** | **String**|  |
 **idempotencyKey** | **String**| Reuse the same key to retry an identical change safely. |
 **emotionFeedbackRequest** | [**EmotionFeedbackRequest**](EmotionFeedbackRequest.md)|  |

### Return type

[**ContributionFeedbackChange**](ContributionFeedbackChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postContributionFeedbackGet**
> ContributionFeedbackSummary postContributionFeedbackGet(targetId)

Read separate quality and emotional feedback for a post

Public visitors can read visible targets; authenticated readers receive their own values and block/mute filtered counts. Returns 404 while this feature is disabled.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReactionsApi();
final String targetId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.postContributionFeedbackGet(targetId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReactionsApi->postContributionFeedbackGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **targetId** | **String**|  |

### Return type

[**ContributionFeedbackSummary**](ContributionFeedbackSummary.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postContributionQualitySet**
> ContributionFeedbackChange postContributionQualitySet(targetId, idempotencyKey, qualityFeedbackRequest)

Set or remove quality feedback on a post

Authenticated readers may set one independent value per channel and target. A null value removes that channel; feedback does not change reputation or rewards. Returns 404 while disabled.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReactionsApi();
final String targetId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Reuse the same key to retry an identical change safely.
final QualityFeedbackRequest qualityFeedbackRequest = ; // QualityFeedbackRequest |

try {
    final response = api.postContributionQualitySet(targetId, idempotencyKey, qualityFeedbackRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReactionsApi->postContributionQualitySet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **targetId** | **String**|  |
 **idempotencyKey** | **String**| Reuse the same key to retry an identical change safely. |
 **qualityFeedbackRequest** | [**QualityFeedbackRequest**](QualityFeedbackRequest.md)|  |

### Return type

[**ContributionFeedbackChange**](ContributionFeedbackChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
