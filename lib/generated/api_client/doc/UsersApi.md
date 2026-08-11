# lythaus_api_client.api.UsersApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**usersGet**](UsersApi.md#usersget) | **GET** /users/{id} | Get a public user profile
[**usersMeRegionUpdate**](UsersApi.md#usersmeregionupdate) | **PUT** /users/me/region | Update private region and visibility preferences
[**usersMeRetentionUpdate**](UsersApi.md#usersmeretentionupdate) | **PUT** /users/me/retention | Update a private content-retention rule


# **usersGet**
> JsonObject usersGet(id)

Get a public user profile

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getUsersApi();
final String id = id_example; // String |

try {
    final response = api.usersGet(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling UsersApi->usersGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **usersMeRegionUpdate**
> UsersMeRegionUpdate200Response usersMeRegionUpdate(idempotencyKey, usersMeRegionUpdateRequest)

Update private region and visibility preferences

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getUsersApi();
final String idempotencyKey = idempotencyKey_example; // String | Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed.
final UsersMeRegionUpdateRequest usersMeRegionUpdateRequest = ; // UsersMeRegionUpdateRequest |

try {
    final response = api.usersMeRegionUpdate(idempotencyKey, usersMeRegionUpdateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling UsersApi->usersMeRegionUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **idempotencyKey** | **String**| Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. |
 **usersMeRegionUpdateRequest** | [**UsersMeRegionUpdateRequest**](UsersMeRegionUpdateRequest.md)|  |

### Return type

[**UsersMeRegionUpdate200Response**](UsersMeRegionUpdate200Response.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **usersMeRetentionUpdate**
> UsersMeRetentionUpdate200Response usersMeRetentionUpdate(idempotencyKey, usersMeRetentionUpdateRequest)

Update a private content-retention rule

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getUsersApi();
final String idempotencyKey = idempotencyKey_example; // String | Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed.
final UsersMeRetentionUpdateRequest usersMeRetentionUpdateRequest = ; // UsersMeRetentionUpdateRequest |

try {
    final response = api.usersMeRetentionUpdate(idempotencyKey, usersMeRetentionUpdateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling UsersApi->usersMeRetentionUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **idempotencyKey** | **String**| Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. |
 **usersMeRetentionUpdateRequest** | [**UsersMeRetentionUpdateRequest**](UsersMeRetentionUpdateRequest.md)|  |

### Return type

[**UsersMeRetentionUpdate200Response**](UsersMeRetentionUpdate200Response.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
