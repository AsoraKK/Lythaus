# lythaus_api_client.model.MediaUploadStatus

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**uploadSessionId** | **String** |  |
**status** | **String** |  |
**expiresAt** | [**DateTime**](DateTime.md) |  |
**processingComplete** | **bool** | Integrity processing only; never a safety or authenticity decision. |
**safety** | [**MediaUploadStatusSafety**](MediaUploadStatusSafety.md) |  |
**authenticity** | [**MediaUploadStatusSafety**](MediaUploadStatusSafety.md) |  |
**publication** | [**MediaUploadStatusPublication**](MediaUploadStatusPublication.md) |  |
**private** | **bool** |  |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
