# lythaus_api_client.api.CustomFeedsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**customFeedsCreate**](CustomFeedsApi.md#customfeedscreate) | **POST** /custom-feeds | Create a custom feed
[**customFeedsDelete**](CustomFeedsApi.md#customfeedsdelete) | **DELETE** /custom-feeds/{id} | Delete an owned custom feed
[**customFeedsGet**](CustomFeedsApi.md#customfeedsget) | **GET** /custom-feeds/{id} | Get an owned custom feed
[**customFeedsItemsList**](CustomFeedsApi.md#customfeedsitemslist) | **GET** /custom-feeds/{id}/items | List items from an owned custom feed
[**customFeedsList**](CustomFeedsApi.md#customfeedslist) | **GET** /custom-feeds | List my custom feeds
[**customFeedsReplace**](CustomFeedsApi.md#customfeedsreplace) | **PUT** /custom-feeds/{id} | Replace an owned custom feed
[**customFeedsUpdate**](CustomFeedsApi.md#customfeedsupdate) | **PATCH** /custom-feeds/{id} | Partially update an owned custom feed


# **customFeedsCreate**
> CustomFeed customFeedsCreate(customFeedCreateRequest, idempotencyKey)

Create a custom feed

Tier limits are Free 1, Premium 2, and Black 3 custom feeds.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();
final CustomFeedCreateRequest customFeedCreateRequest = ; // CustomFeedCreateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.customFeedsCreate(customFeedCreateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling CustomFeedsApi->customFeedsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **customFeedCreateRequest** | [**CustomFeedCreateRequest**](CustomFeedCreateRequest.md)|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**CustomFeed**](CustomFeed.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **customFeedsDelete**
> CustomFeedDeleteResponse customFeedsDelete(id, idempotencyKey)

Delete an owned custom feed

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.customFeedsDelete(id, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling CustomFeedsApi->customFeedsDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**CustomFeedDeleteResponse**](CustomFeedDeleteResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **customFeedsGet**
> CustomFeed customFeedsGet(id)

Get an owned custom feed

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.customFeedsGet(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling CustomFeedsApi->customFeedsGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**CustomFeed**](CustomFeed.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **customFeedsItemsList**
> DiscoveryFeedPage customFeedsItemsList(id, cursor, limit)

List items from an owned custom feed

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String cursor = cursor_example; // String | Opaque keyset cursor returned by the preceding page.
final int limit = 56; // int |

try {
    final response = api.customFeedsItemsList(id, cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling CustomFeedsApi->customFeedsItemsList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
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

# **customFeedsList**
> CustomFeedList customFeedsList()

List my custom feeds

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();

try {
    final response = api.customFeedsList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling CustomFeedsApi->customFeedsList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**CustomFeedList**](CustomFeedList.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **customFeedsReplace**
> CustomFeed customFeedsReplace(id, customFeedUpdateRequest, idempotencyKey)

Replace an owned custom feed

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final CustomFeedUpdateRequest customFeedUpdateRequest = ; // CustomFeedUpdateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.customFeedsReplace(id, customFeedUpdateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling CustomFeedsApi->customFeedsReplace: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **customFeedUpdateRequest** | [**CustomFeedUpdateRequest**](CustomFeedUpdateRequest.md)|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**CustomFeed**](CustomFeed.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **customFeedsUpdate**
> CustomFeed customFeedsUpdate(id, customFeedUpdateRequest, idempotencyKey)

Partially update an owned custom feed

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final CustomFeedUpdateRequest customFeedUpdateRequest = ; // CustomFeedUpdateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.customFeedsUpdate(id, customFeedUpdateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling CustomFeedsApi->customFeedsUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **customFeedUpdateRequest** | [**CustomFeedUpdateRequest**](CustomFeedUpdateRequest.md)|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**CustomFeed**](CustomFeed.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
