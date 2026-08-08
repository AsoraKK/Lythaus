# lythaus_api_client.model.ErrorResponseError

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**code** | **String** | Machine-readable error code |
**message** | **String** | Human-readable description |
**correlationId** | **String** | Correlation ID for distributed tracing | [optional]
**details** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) | Optional structured details (e.g. field-level validation errors) | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
