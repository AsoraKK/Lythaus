# lythaus_api_client.api.FeedApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**feedDiscover**](FeedApi.md#feeddiscover) | **GET** /feed/discover | List the public discovery feed
[**feedList**](FeedApi.md#feedlist) | **GET** /feed | List the authenticated personal feed
[**feedNews**](FeedApi.md#feednews) | **GET** /feed/news | List the Black-tier News Board
[**newsBoardGetLegacy**](FeedApi.md#newsboardgetlegacy) | **GET** /news-board | List the Black-tier News Board


# **feedDiscover**
> DiscoveryFeedPage feedDiscover(cursor, limit)

List the public discovery feed

Anonymous callers receive the public page. Authenticated callers additionally receive block and mute filtering.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getFeedApi();
final String cursor = cursor_example; // String | Opaque keyset cursor returned by the preceding page.
final int limit = 56; // int |

try {
    final response = api.feedDiscover(cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling FeedApi->feedDiscover: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**| Opaque keyset cursor returned by the preceding page. | [optional]
 **limit** | **int**|  | [optional] [default to 25]

### Return type

[**DiscoveryFeedPage**](DiscoveryFeedPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **feedList**
> PersonalFeedPage feedList(cursor, limit)

List the authenticated personal feed

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getFeedApi();
final String cursor = cursor_example; // String | Opaque keyset cursor returned by the preceding page.
final int limit = 56; // int |

try {
    final response = api.feedList(cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling FeedApi->feedList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**| Opaque keyset cursor returned by the preceding page. | [optional]
 **limit** | **int**|  | [optional] [default to 25]

### Return type

[**PersonalFeedPage**](PersonalFeedPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **feedNews**
> NewsBoardFeedPage feedNews(cursor, limit)

List the Black-tier News Board

This is an authenticated Black-only entitlement. Free and Premium callers receive a forbidden response; there is no preview contract.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getFeedApi();
final String cursor = cursor_example; // String | Opaque keyset cursor returned by the preceding page.
final int limit = 56; // int |

try {
    final response = api.feedNews(cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling FeedApi->feedNews: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**| Opaque keyset cursor returned by the preceding page. | [optional]
 **limit** | **int**|  | [optional] [default to 25]

### Return type

[**NewsBoardFeedPage**](NewsBoardFeedPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **newsBoardGetLegacy**
> NewsBoardFeedPage newsBoardGetLegacy(cursor, limit)

List the Black-tier News Board

Compatibility alias for `/feed/news`. This is an authenticated Black-only entitlement.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getFeedApi();
final String cursor = cursor_example; // String | Opaque keyset cursor returned by the preceding page.
final int limit = 56; // int |

try {
    final response = api.newsBoardGetLegacy(cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling FeedApi->newsBoardGetLegacy: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**| Opaque keyset cursor returned by the preceding page. | [optional]
 **limit** | **int**|  | [optional] [default to 25]

### Return type

[**NewsBoardFeedPage**](NewsBoardFeedPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
