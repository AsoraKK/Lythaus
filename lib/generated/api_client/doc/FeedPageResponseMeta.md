# lythaus_api_client.model.FeedPageResponseMeta

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**count** | **int** | Number of items returned |
**nextCursor** | **String** | Cursor for fetching the next page; null when no further pages exist | [optional]
**timingsMs** | **BuiltMap&lt;String, num&gt;** | Server-side timing breakdown (ms) | [optional]
**applied** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) | Applied ranking modifiers and personalization signals | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
