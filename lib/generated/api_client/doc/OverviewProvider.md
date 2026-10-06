# lythaus_api_client.model.OverviewProvider

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**enabled** | **bool** |  |
**status** | **String** |  |
**reason** | **String** |  |
**sampledAt** | [**DateTime**](DateTime.md) |  |
**requests** | **num** |  | [optional]
**errors** | **num** |  | [optional]
**latencyMs** | **num** |  | [optional]
**queues** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) |  | [optional]
**storageBytes** | **num** |  | [optional]
**connections** | **num** |  | [optional]
**queryLatencyMs** | **num** |  | [optional]
**accruedCost** | **num** | Accrued estimate only after attribution and currency are verified. |
**finalizedCost** | **num** | Finalized invoice amount separately from accrued estimates. |
**currency** | **String** |  |
**accountingPeriod** | [**OverviewProviderAccountingPeriod**](OverviewProviderAccountingPeriod.md) |  |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
