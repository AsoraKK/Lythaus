# lythaus_api_client.model.ActivityMetric

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**state** | **String** |  |
**value** | **int** |  |
**observedLowerBound** | **int** | Positive observed active count only when coverage is incomplete. Never valid for quiet. |
**cohortSize** | **int** |  |
**since** | [**DateTime**](DateTime.md) |  |
**until** | [**DateTime**](DateTime.md) | Exclusive completed UTC-day boundary. |
**reason** | **String** |  |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
