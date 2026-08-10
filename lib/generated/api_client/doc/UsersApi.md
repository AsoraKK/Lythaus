# lythaus_api_client.api.UsersApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**usersGet**](UsersApi.md#usersget) | **GET** /users/{id} | Get a public user profile
[**usersPostsList**](UsersApi.md#userspostslist) | **GET** /users/{userId}/posts | List posts by a user
[**usersTrustPassport**](UsersApi.md#userstrustpassport) | **GET** /users/{id}/trust-passport | Get trust passport for a user


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

# **usersPostsList**
> JsonObject usersPostsList(userId)

List posts by a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getUsersApi();
final String userId = userId_example; // String |

try {
    final response = api.usersPostsList(userId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling UsersApi->usersPostsList: $e\n');
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

# **usersTrustPassport**
> JsonObject usersTrustPassport(id)

Get trust passport for a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getUsersApi();
final String id = id_example; // String |

try {
    final response = api.usersTrustPassport(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling UsersApi->usersTrustPassport: $e\n');
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
