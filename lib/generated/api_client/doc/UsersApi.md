# lythaus_api_client.api.UsersApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**usersFollowCreate**](UsersApi.md#usersfollowcreate) | **POST** /users/{id}/follow | Follow a user
[**usersFollowDelete**](UsersApi.md#usersfollowdelete) | **DELETE** /users/{id}/follow | Unfollow a user
[**usersFollowGet**](UsersApi.md#usersfollowget) | **GET** /users/{id}/follow | Get follow status for a user
[**usersGet**](UsersApi.md#usersget) | **GET** /users/{id} | Get a public user profile
[**usersPostsList**](UsersApi.md#userspostslist) | **GET** /users/{userId}/posts | List posts by a user
[**usersTrustPassport**](UsersApi.md#userstrustpassport) | **GET** /users/{id}/trust-passport | Get trust passport for a user


# **usersFollowCreate**
> JsonObject usersFollowCreate(id, body)

Follow a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getUsersApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.usersFollowCreate(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling UsersApi->usersFollowCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **usersFollowDelete**
> JsonObject usersFollowDelete(id)

Unfollow a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getUsersApi();
final String id = id_example; // String |

try {
    final response = api.usersFollowDelete(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling UsersApi->usersFollowDelete: $e\n');
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

# **usersFollowGet**
> JsonObject usersFollowGet(id)

Get follow status for a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getUsersApi();
final String id = id_example; // String |

try {
    final response = api.usersFollowGet(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling UsersApi->usersFollowGet: $e\n');
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
