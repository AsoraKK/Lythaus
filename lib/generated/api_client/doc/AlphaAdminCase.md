# lythaus_api_client.model.AlphaAdminCase

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**diagnostics** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) |  | [optional]
**feedback** | [**BuiltList&lt;AlphaReview&gt;**](AlphaReview.md) |  | [optional]
**schemaVersion** | **String** |  |
**caseId** | **String** |  |
**contentKind** | **String** |  |
**status** | **String** |  |
**createdAt** | [**DateTime**](DateTime.md) |  | [optional]
**updatedAt** | [**DateTime**](DateTime.md) |  | [optional]
**expiresAt** | [**DateTime**](DateTime.md) |  | [optional]
**reviewState** | **String** |  | [optional]
**finding** | **String** |  |
**interpretation** | **String** |  |
**explanation** | **String** |  | [optional]
**execution** | [**BuiltMap&lt;String, AlphaComponent&gt;**](AlphaComponent.md) |  |
**observer** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) |  | [optional]
**adviserStatus** | **String** |  | [optional]
**limitations** | **BuiltList&lt;String&gt;** |  | [optional]
**versions** | **BuiltMap&lt;String, String&gt;** |  | [optional]
**hasText** | **bool** |  | [optional]
**hasImage** | **bool** |  | [optional]
**publicationEligible** | **bool** |  |
**rewardsEligible** | **bool** |  |
**reviews** | [**BuiltList&lt;AlphaReview&gt;**](AlphaReview.md) |  | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
