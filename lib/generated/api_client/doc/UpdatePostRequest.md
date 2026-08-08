# lythaus_api_client.model.UpdatePostRequest

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**content** | **String** |  | [optional]
**contentType** | **String** |  | [optional]
**mediaUrls** | **BuiltList&lt;String&gt;** |  | [optional]
**topics** | **BuiltList&lt;String&gt;** |  | [optional]
**visibility** | **String** |  | [optional]
**isNews** | **bool** |  | [optional]
**aiLabel** | **String** | Required whenever content or media changes. Public responses use categorical labels only. | [optional]
**proofSignals** | [**PostProofSignals**](PostProofSignals.md) |  | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
