# lythaus_api_client.model.BetaCase

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**schemaVersion** | **String** |  |
**caseId** | **String** |  |
**status** | **String** |  |
**createdAt** | [**DateTime**](DateTime.md) |  |
**updatedAt** | [**DateTime**](DateTime.md) |  |
**expiresAt** | [**DateTime**](DateTime.md) |  |
**reviewState** | **String** |  |
**finding** | **String** |  |
**explanation** | **String** |  |
**advisoryStatus** | **String** |  |
**limitations** | **BuiltList&lt;String&gt;** |  |
**versions** | **BuiltMap&lt;String, String&gt;** |  |
**publicationEligible** | **bool** |  |
**rewardsEligible** | **bool** |  |
**reviews** | [**BuiltList&lt;BetaReview&gt;**](BetaReview.md) |  | [optional]
**detectorExecution** | **String** | Execution availability, separate from interpretation. Completed includes inconclusive unknown-history and JPEG results; no score or threshold is exposed. | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
