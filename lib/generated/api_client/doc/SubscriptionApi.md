# lythaus_api_client.api.SubscriptionApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**subscriptionStatus**](SubscriptionApi.md#subscriptionstatus) | **GET** /subscription/status | Get current user subscription status


# **subscriptionStatus**
> SubscriptionStatus subscriptionStatus()

Get current user subscription status

Return the authenticated user's subscription tier and alpha entitlements, including custom feed count, News Board access, posting restriction, and reputation reward limits.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSubscriptionApi();

try {
    final response = api.subscriptionStatus();
    print(response);
} catch on DioException (e) {
    print('Exception when calling SubscriptionApi->subscriptionStatus: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**SubscriptionStatus**](SubscriptionStatus.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
