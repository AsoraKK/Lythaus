# lythaus_api_client.api.SubscriptionApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**subscriptionStatus**](SubscriptionApi.md#subscriptionstatus) | **GET** /subscription/status | Get current account access tier


# **subscriptionStatus**
> SubscriptionStatus subscriptionStatus()

Get current account access tier

Return the authenticated account's server-recorded access tier and its custom-feed and News Board entitlements. The Worker derives this response from identity.user_entitlements.subscription_tier; missing or unknown stored values resolve to Free. The current contract has no provider, pending-purchase, payment-confirmation, cancellation, or expiry state. Manual tier changes are supported, but this response does not identify how a tier was granted. Unknown extra response fields must not be interpreted as payment lifecycle state.

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
