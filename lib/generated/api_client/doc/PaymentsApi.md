# lythaus_api_client.api.PaymentsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**paymentsWebhook**](PaymentsApi.md#paymentswebhook) | **POST** /payments/webhook | Handle payment provider webhook


# **paymentsWebhook**
> JsonObject paymentsWebhook(body)

Handle payment provider webhook

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPaymentsApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.paymentsWebhook(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PaymentsApi->paymentsWebhook: $e\n');
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
