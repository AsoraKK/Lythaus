# lythaus_api_client.api.CustomFeedsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**customFeedsCreate**](CustomFeedsApi.md#customfeedscreate) | **POST** /custom-feeds | Create a new custom feed
[**customFeedsDelete**](CustomFeedsApi.md#customfeedsdelete) | **DELETE** /custom-feeds/{id} | Delete a custom feed
[**customFeedsGet**](CustomFeedsApi.md#customfeedsget) | **GET** /custom-feeds/{id} | Get a custom feed
[**customFeedsItemsList**](CustomFeedsApi.md#customfeedsitemslist) | **GET** /custom-feeds/{id}/items | List items in a custom feed
[**customFeedsList**](CustomFeedsApi.md#customfeedslist) | **GET** /custom-feeds | List custom feeds for the current user
[**customFeedsUpdate**](CustomFeedsApi.md#customfeedsupdate) | **PATCH** /custom-feeds/{id} | Update a custom feed


# **customFeedsCreate**
> CustomFeedDefinition customFeedsCreate(createCustomFeedRequest)

Create a new custom feed

Create a custom feed definition. The service enforces tier limits: Free users may create 1 custom feed, Premium users 2, Black users 3, and Admin users 20.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();
final CreateCustomFeedRequest createCustomFeedRequest = ; // CreateCustomFeedRequest |

try {
    final response = api.customFeedsCreate(createCustomFeedRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling CustomFeedsApi->customFeedsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **createCustomFeedRequest** | [**CreateCustomFeedRequest**](CreateCustomFeedRequest.md)|  |

### Return type

[**CustomFeedDefinition**](CustomFeedDefinition.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **customFeedsDelete**
> customFeedsDelete(id)

Delete a custom feed

Delete an owned custom feed definition.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();
final String id = id_example; // String |

try {
    api.customFeedsDelete(id);
} catch on DioException (e) {
    print('Exception when calling CustomFeedsApi->customFeedsDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **customFeedsGet**
> CustomFeedDefinition customFeedsGet(id)

Get a custom feed

Fetch a custom feed definition owned by the authenticated user.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();
final String id = id_example; // String |

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

[**CustomFeedDefinition**](CustomFeedDefinition.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **customFeedsItemsList**
> CursorPaginatedPostView customFeedsItemsList(id, cursor, limit)

List items in a custom feed

Return posts matching a custom feed's filters.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();
final String id = id_example; // String |
final String cursor = eyJsYXN0SWQiOiIwMThiMjdkNC01YjNiLTczZTMtYmY3Ny1iZjdiYjk1MzBmMjEiLCJ0cyI6MTcxNDQ3ODQwMH0; // String | Opaque pagination cursor returned in the previous response's `meta.nextCursor`
final int limit = 25; // int | Maximum number of items to return per page

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
 **cursor** | **String**| Opaque pagination cursor returned in the previous response's `meta.nextCursor` | [optional]
 **limit** | **int**| Maximum number of items to return per page | [optional] [default to 25]

### Return type

[**CursorPaginatedPostView**](CursorPaginatedPostView.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **customFeedsList**
> CustomFeedListResponse customFeedsList(cursor, limit)

List custom feeds for the current user

List custom feed definitions owned by the authenticated user.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();
final String cursor = eyJsYXN0SWQiOiIwMThiMjdkNC01YjNiLTczZTMtYmY3Ny1iZjdiYjk1MzBmMjEiLCJ0cyI6MTcxNDQ3ODQwMH0; // String | Opaque pagination cursor returned in the previous response's `meta.nextCursor`
final int limit = 25; // int | Maximum number of items to return per page

try {
    final response = api.customFeedsList(cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling CustomFeedsApi->customFeedsList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**| Opaque pagination cursor returned in the previous response's `meta.nextCursor` | [optional]
 **limit** | **int**| Maximum number of items to return per page | [optional] [default to 25]

### Return type

[**CustomFeedListResponse**](CustomFeedListResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **customFeedsUpdate**
> CustomFeedDefinition customFeedsUpdate(id, updateCustomFeedRequest)

Update a custom feed

Update an owned custom feed's name, filters, sorting, or home flag.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCustomFeedsApi();
final String id = id_example; // String |
final UpdateCustomFeedRequest updateCustomFeedRequest = ; // UpdateCustomFeedRequest |

try {
    final response = api.customFeedsUpdate(id, updateCustomFeedRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling CustomFeedsApi->customFeedsUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **updateCustomFeedRequest** | [**UpdateCustomFeedRequest**](UpdateCustomFeedRequest.md)|  |

### Return type

[**CustomFeedDefinition**](CustomFeedDefinition.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
