# lythaus_api_client.model.SubscriptionStatus

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**userId** | **String** |  |
**tier** | **String** |  |
**status** | **String** |  |
**provider** | **String** |  |
**currentPeriodEnd** | [**DateTime**](DateTime.md) |  |
**cancelAtPeriodEnd** | **bool** |  |
**accessLabel** | **String** | Manual Alpha entitlement label; no active payment system is implied. |
**manualGrantExpiresAt** | [**DateTime**](DateTime.md) |  |
**manualGrantReviewAt** | [**DateTime**](DateTime.md) |  |
**entitlements** | [**SubscriptionStatusEntitlements**](SubscriptionStatusEntitlements.md) |  |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
