# lythaus_api_client.api.ReactionsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**reactionsDelete**](ReactionsApi.md#reactionsdelete) | **DELETE** /reactions/{id} | Delete my reaction
[**reactionsPost**](ReactionsApi.md#reactionspost) | **POST** /reactions | Submit a structured reaction


# **reactionsDelete**
> reactionsDelete(id)

Delete my reaction

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReactionsApi();
final String id = id_example; // String |

try {
    api.reactionsDelete(id);
} catch on DioException (e) {
    print('Exception when calling ReactionsApi->reactionsDelete: $e\n');
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

# **reactionsPost**
> SubmitReactionResponse reactionsPost(submitReactionRequest)

Submit a structured reaction

Records a structured reaction and applies anti-gaming controls before deciding whether it contributes to reputation.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReactionsApi();
final SubmitReactionRequest submitReactionRequest = ; // SubmitReactionRequest |

try {
    final response = api.reactionsPost(submitReactionRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReactionsApi->reactionsPost: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **submitReactionRequest** | [**SubmitReactionRequest**](SubmitReactionRequest.md)|  |

### Return type

[**SubmitReactionResponse**](SubmitReactionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
