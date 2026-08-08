# lythaus_api_client.api.RewardsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**rewardsMeGet**](RewardsApi.md#rewardsmeget) | **GET** /rewards/me | Get my rewards snapshot
[**rewardsRedeemPost**](RewardsApi.md#rewardsredeempost) | **POST** /rewards/{id}/redeem | Redeem a reward


# **rewardsMeGet**
> RewardsMeResponse rewardsMeGet()

Get my rewards snapshot

Returns rewards available under the caller's subscription tier, reputation level, redemption limits, and fraud/maturity checks.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getRewardsApi();

try {
    final response = api.rewardsMeGet();
    print(response);
} catch on DioException (e) {
    print('Exception when calling RewardsApi->rewardsMeGet: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**RewardsMeResponse**](RewardsMeResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **rewardsRedeemPost**
> RewardRedemption rewardsRedeemPost(id)

Redeem a reward

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getRewardsApi();
final String id = id_example; // String |

try {
    final response = api.rewardsRedeemPost(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling RewardsApi->rewardsRedeemPost: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**RewardRedemption**](RewardRedemption.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
