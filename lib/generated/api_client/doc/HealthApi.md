# lythaus_api_client.api.HealthApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**getHealth**](HealthApi.md#gethealth) | **GET** /health | Service health probe
[**ready**](HealthApi.md#ready) | **GET** /ready | Readiness probe


# **getHealth**
> GetHealth200Response getHealth()

Service health probe

Liveness/readiness check. No auth.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getHealthApi();

try {
    final response = api.getHealth();
    print(response);
} catch on DioException (e) {
    print('Exception when calling HealthApi->getHealth: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**GetHealth200Response**](GetHealth200Response.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **ready**
> JsonObject ready()

Readiness probe

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getHealthApi();

try {
    final response = api.ready();
    print(response);
} catch on DioException (e) {
    print('Exception when calling HealthApi->ready: $e\n');
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
