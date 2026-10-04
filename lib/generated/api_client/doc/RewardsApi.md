# lythaus_api_client.api.RewardsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**getMyMonthlyRewards**](RewardsApi.md#getmymonthlyrewards) | **GET** /rewards/me/monthly | Read my monthly level and reward eligibility
[**rewardsMeGet**](RewardsApi.md#rewardsmeget) | **GET** /rewards/me | Get my rewards snapshot
[**rewardsRedeemPost**](RewardsApi.md#rewardsredeempost) | **POST** /rewards/{id}/redeem | Redeem a reward


# **getMyMonthlyRewards**
> MonthlyRewardsMeResponse getMyMonthlyRewards()

Read my monthly level and reward eligibility

Returns the server-owned fixed monthly level snapshot and the member's current reward selection state. Paid tier changes reward choices only, not reputation scoring. No snapshot, selection or partner state is exposed until its owner-approved configuration is available.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getRewardsApi();

try {
    final response = api.getMyMonthlyRewards();
    print(response);
} catch on DioException (e) {
    print('Exception when calling RewardsApi->getMyMonthlyRewards: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**MonthlyRewardsMeResponse**](MonthlyRewardsMeResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

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
> RewardRedemption rewardsRedeemPost(id, idempotencyKey)

Redeem a reward

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getRewardsApi();
final String id = id_example; // String |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.rewardsRedeemPost(id, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling RewardsApi->rewardsRedeemPost: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**RewardRedemption**](RewardRedemption.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
