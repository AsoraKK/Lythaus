# lythaus_api_client.api.ActivityApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**activityList**](ActivityApi.md#activitylist) | **GET** /activity | List my auditable activity
[**activityListLegacy**](ActivityApi.md#activitylistlegacy) | **GET** /users/me/activity | List my auditable activity
[**productIntegrityProfileGetMe**](ActivityApi.md#productintegrityprofilegetme) | **GET** /users/me | Get my private profile
[**productIntegrityProfileReplaceMe**](ActivityApi.md#productintegrityprofilereplaceme) | **PUT** /users/me | Update my private profile
[**productIntegrityProfileUpdateMe**](ActivityApi.md#productintegrityprofileupdateme) | **PATCH** /users/me | Partially update my private profile


# **activityList**
> ActivityPage activityList(cursor, limit, category)

List my auditable activity

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getActivityApi();
final String cursor = cursor_example; // String | Opaque keyset cursor returned by the preceding page.
final int limit = 56; // int |
final String category = category_example; // String |

try {
    final response = api.activityList(cursor, limit, category);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ActivityApi->activityList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**| Opaque keyset cursor returned by the preceding page. | [optional]
 **limit** | **int**|  | [optional] [default to 25]
 **category** | **String**|  | [optional]

### Return type

[**ActivityPage**](ActivityPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **activityListLegacy**
> ActivityPage activityListLegacy(cursor, limit, category)

List my auditable activity

Compatibility alias for `/activity`.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getActivityApi();
final String cursor = cursor_example; // String | Opaque keyset cursor returned by the preceding page.
final int limit = 56; // int |
final String category = category_example; // String |

try {
    final response = api.activityListLegacy(cursor, limit, category);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ActivityApi->activityListLegacy: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**| Opaque keyset cursor returned by the preceding page. | [optional]
 **limit** | **int**|  | [optional] [default to 25]
 **category** | **String**|  | [optional]

### Return type

[**ActivityPage**](ActivityPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **productIntegrityProfileGetMe**
> ProductIntegrityPrivateProfileResponse productIntegrityProfileGetMe()

Get my private profile

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getActivityApi();

try {
    final response = api.productIntegrityProfileGetMe();
    print(response);
} catch on DioException (e) {
    print('Exception when calling ActivityApi->productIntegrityProfileGetMe: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**ProductIntegrityPrivateProfileResponse**](ProductIntegrityPrivateProfileResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **productIntegrityProfileReplaceMe**
> ProductIntegrityPrivateProfileResponse productIntegrityProfileReplaceMe(productIntegrityProfileUpdateRequest, idempotencyKey)

Update my private profile

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getActivityApi();
final ProductIntegrityProfileUpdateRequest productIntegrityProfileUpdateRequest = ; // ProductIntegrityProfileUpdateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.productIntegrityProfileReplaceMe(productIntegrityProfileUpdateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ActivityApi->productIntegrityProfileReplaceMe: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **productIntegrityProfileUpdateRequest** | [**ProductIntegrityProfileUpdateRequest**](ProductIntegrityProfileUpdateRequest.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**ProductIntegrityPrivateProfileResponse**](ProductIntegrityPrivateProfileResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **productIntegrityProfileUpdateMe**
> ProductIntegrityPrivateProfileResponse productIntegrityProfileUpdateMe(productIntegrityProfileUpdateRequest, idempotencyKey)

Partially update my private profile

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getActivityApi();
final ProductIntegrityProfileUpdateRequest productIntegrityProfileUpdateRequest = ; // ProductIntegrityProfileUpdateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.productIntegrityProfileUpdateMe(productIntegrityProfileUpdateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ActivityApi->productIntegrityProfileUpdateMe: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **productIntegrityProfileUpdateRequest** | [**ProductIntegrityProfileUpdateRequest**](ProductIntegrityProfileUpdateRequest.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**ProductIntegrityPrivateProfileResponse**](ProductIntegrityPrivateProfileResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
