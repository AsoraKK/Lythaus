# lythaus_api_client.model.RateLimitError

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**error** | **String** | Constant identifier for rate limit breaches |
**scope** | **String** | Scope of the limit that triggered the breach |
**limit** | **int** | Maximum requests permitted within the window |
**windowSeconds** | **int** | Window size for the limit in seconds |
**retryAfterSeconds** | **int** | Seconds until the limit resets |
**traceId** | **String** | Correlation identifier for tracing |
**reason** | **String** | Additional context for specialized scopes (e.g. auth backoff) | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
