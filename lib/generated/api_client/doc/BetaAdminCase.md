# lythaus_api_client.model.BetaAdminCase

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**schemaVersion** | **String** |  | [optional]
**caseId** | **String** |  | [optional]
**status** | **String** |  | [optional]
**createdAt** | [**DateTime**](DateTime.md) |  | [optional]
**updatedAt** | [**DateTime**](DateTime.md) |  | [optional]
**expiresAt** | [**DateTime**](DateTime.md) |  | [optional]
**reviewState** | **String** |  | [optional]
**finding** | **String** |  | [optional]
**explanation** | **String** |  | [optional]
**advisoryStatus** | **String** |  | [optional]
**limitations** | **BuiltList&lt;String&gt;** |  | [optional]
**versions** | **BuiltMap&lt;String, String&gt;** |  | [optional]
**publicationEligible** | **bool** |  | [optional]
**rewardsEligible** | **bool** |  | [optional]
**reviews** | [**BuiltList&lt;BetaReview&gt;**](BetaReview.md) |  | [optional]
**feedback** | [**BuiltList&lt;BuiltMap&lt;String, JsonObject&gt;&gt;**](BuiltMap.md) |  | [optional]
**diagnostics** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) |  | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
