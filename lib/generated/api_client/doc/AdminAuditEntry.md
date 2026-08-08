# lythaus_api_client.model.AdminAuditEntry

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **String** |  | [optional]
**timestamp** | [**DateTime**](DateTime.md) |  | [optional]
**actorId** | **String** |  | [optional]
**action** | **String** |  | [optional]
**targetType** | **String** |  | [optional]
**subjectId** | **String** |  | [optional]
**reasonCode** | **String** |  | [optional]
**note** | **String** |  | [optional]
**before** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) |  | [optional]
**after** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) |  | [optional]
**correlationId** | **String** |  | [optional]
**metadata** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) |  | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
