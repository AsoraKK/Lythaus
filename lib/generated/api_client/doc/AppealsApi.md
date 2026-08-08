# lythaus_api_client.api.AppealsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**appealsCreate**](AppealsApi.md#appealscreate) | **POST** /appeals | Submit a new appeal
[**appealsGet**](AppealsApi.md#appealsget) | **GET** /appeals/{id} | Get appeal detail
[**appealsVote**](AppealsApi.md#appealsvote) | **POST** /appeals/{id}/votes | Cast a community vote on an appeal


# **appealsCreate**
> JsonObject appealsCreate(body)

Submit a new appeal

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAppealsApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.appealsCreate(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->appealsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **appealsGet**
> JsonObject appealsGet(id)

Get appeal detail

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAppealsApi();
final String id = id_example; // String |

try {
    final response = api.appealsGet(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->appealsGet: $e\n');
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

# **appealsVote**
> JsonObject appealsVote(id, body)

Cast a community vote on an appeal

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAppealsApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.appealsVote(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AppealsApi->appealsVote: $e\n');
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
