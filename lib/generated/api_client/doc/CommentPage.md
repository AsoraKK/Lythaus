# lythaus_api_client.model.CommentPage

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**nextCursor** | **String** | Opaque cursor for the next page, or null when exhausted. |
**refreshCursor** | **String** | Reply tail cursor for an explicit check for new replies. | [optional]
**capabilities** | [**CommentPageAllOfCapabilities**](CommentPageAllOfCapabilities.md) |  | [optional]
**items** | [**BuiltList&lt;Comment&gt;**](Comment.md) |  |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
