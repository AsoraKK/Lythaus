# lythaus_api_client.model.AdminSetUserTierRequest

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**tier** | **String** |  |
**reason** | **String** |  |
**expiresAt** | [**DateTime**](DateTime.md) | Required for Premium and Black Alpha grants; no more than 90 days ahead. | [optional]
**reviewAt** | [**DateTime**](DateTime.md) | Required for Premium and Black Alpha grants; on or before expiresAt. | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
