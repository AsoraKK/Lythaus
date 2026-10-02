# lythaus_api_client.model.AccountSupportHistoryRequest

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**reasonCode** | **String** | Use a machine reason code without personal information; it is trimmed and normalized to uppercase. |
**source_** | **String** |  | [optional]
**eventType** | **String** |  | [optional]
**correlationId** | **String** |  | [optional]
**since** | [**DateTime**](DateTime.md) | Inclusive UTC start, with at most six fractional digits; must precede until. | [optional]
**until** | [**DateTime**](DateTime.md) | Exclusive UTC end, with at most six fractional digits. | [optional]
**order** | **String** |  | [optional] [default to 'newest']
**limit** | **int** |  | [optional] [default to 25]
**cursor** | **String** | Opaque keyset cursor, bound to user, filters, order and the first page's snapshot. Preserve it unchanged and keep the same filters for subsequent pages. | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
