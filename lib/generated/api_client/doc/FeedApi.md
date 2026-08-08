# lythaus_api_client.api.FeedApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**feedDiscover**](FeedApi.md#feeddiscover) | **GET** /feed/discover | Return discovery/explore feed
[**feedNews**](FeedApi.md#feednews) | **GET** /feed/news | Return News Board feed
[**feedPublicGet**](FeedApi.md#feedpublicget) | **GET** /feed/public | Retrieve public discovery feed
[**feedUser**](FeedApi.md#feeduser) | **GET** /feed/user/{userId} | Return a public user&#39;s post feed
[**getFeed**](FeedApi.md#getfeed) | **GET** /feed | Retrieve personalized feed items


# **feedDiscover**
> JsonObject feedDiscover()

Return discovery/explore feed

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getFeedApi();

try {
    final response = api.feedDiscover();
    print(response);
} catch on DioException (e) {
    print('Exception when calling FeedApi->feedDiscover: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **feedNews**
> NewsBoardFeedResponse feedNews(cursor, limit, region)

Return News Board feed

Return authenticated News Board posts. Free receives a maximum three-item preview with no cursor; Premium and Black receive the full board. Admin is an authorization role, not a commercial tier. Publishing remains restricted to editorial contributors and approved ingestion paths.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getFeedApi();
final String cursor = eyJsYXN0SWQiOiIwMThiMjdkNC01YjNiLTczZTMtYmY3Ny1iZjdiYjk1MzBmMjEiLCJ0cyI6MTcxNDQ3ODQwMH0; // String | Opaque pagination cursor returned in the previous response's `meta.nextCursor`
final int limit = 25; // int | Maximum number of items to return per page
final String region = region_example; // String |

try {
    final response = api.feedNews(cursor, limit, region);
    print(response);
} catch on DioException (e) {
    print('Exception when calling FeedApi->feedNews: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**| Opaque pagination cursor returned in the previous response's `meta.nextCursor` | [optional]
 **limit** | **int**| Maximum number of items to return per page | [optional] [default to 25]
 **region** | **String**|  | [optional]

### Return type

[**NewsBoardFeedResponse**](NewsBoardFeedResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **feedPublicGet**
> FeedPageResponse feedPublicGet(cursor, limit, includeTopics, excludeTopics)

Retrieve public discovery feed

Public feed surface using ranking safety filters and reputation-derived trust weighting without paid-tier boosting.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getFeedApi();
final String cursor = eyJsYXN0SWQiOiIwMThiMjdkNC01YjNiLTczZTMtYmY3Ny1iZjdiYjk1MzBmMjEiLCJ0cyI6MTcxNDQ3ODQwMH0; // String | Opaque pagination cursor returned in the previous response's `meta.nextCursor`
final int limit = 25; // int | Maximum number of items to return per page
final String includeTopics = includeTopics_example; // String |
final String excludeTopics = excludeTopics_example; // String |

try {
    final response = api.feedPublicGet(cursor, limit, includeTopics, excludeTopics);
    print(response);
} catch on DioException (e) {
    print('Exception when calling FeedApi->feedPublicGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**| Opaque pagination cursor returned in the previous response's `meta.nextCursor` | [optional]
 **limit** | **int**| Maximum number of items to return per page | [optional] [default to 25]
 **includeTopics** | **String**|  | [optional]
 **excludeTopics** | **String**|  | [optional]

### Return type

[**FeedPageResponse**](FeedPageResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **feedUser**
> JsonObject feedUser(userId)

Return a public user's post feed

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getFeedApi();
final String userId = userId_example; // String |

try {
    final response = api.feedUser(userId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling FeedApi->feedUser: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **userId** | **String**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getFeed**
> FeedPageEnvelope getFeed(cursor, limit)

Retrieve personalized feed items

Return a page of feed items.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getFeedApi();
final String cursor = eyJsYXN0SWQiOiIwMThiMjdkNC01YjNiLTczZTMtYmY3Ny1iZjdiYjk1MzBmMjEiLCJ0cyI6MTcxNDQ3ODQwMH0; // String | Opaque pagination cursor returned in the previous response's `meta.nextCursor`
final int limit = 25; // int | Maximum number of items to return per page

try {
    final response = api.getFeed(cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling FeedApi->getFeed: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**| Opaque pagination cursor returned in the previous response's `meta.nextCursor` | [optional]
 **limit** | **int**| Maximum number of items to return per page | [optional] [default to 25]

### Return type

[**FeedPageEnvelope**](FeedPageEnvelope.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
