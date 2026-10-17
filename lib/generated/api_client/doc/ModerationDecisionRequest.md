# lythaus_api_client.model.ModerationDecisionRequest

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**outcome** | **String** |  |
**reasonCode** | **String** |  |
**expectedReviewCycleId** | **String** | Required after re-review; copy reviewCycleId from the current case list or re-review response. An earlier cycle cannot issue a decision. | [optional]
**publicLabel** | **String** | Public categorical label. AI-generated content cannot be allowed for publication. | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
