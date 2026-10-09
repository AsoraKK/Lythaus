# lythaus_api_client.model.MonthlyReputationReportResponse

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**reportState** | **String** |  |
**reasonCode** | **String** |  | [optional]
**sourceMonth** | **String** |  |
**effectiveMonth** | **String** |  |
**policyVersion** | **String** |  |
**levelAuthority** | [**MonthlyReputationReportResponseLevelAuthority**](MonthlyReputationReportResponseLevelAuthority.md) |  |
**corrections** | [**MonthlyReputationReportResponseCorrections**](MonthlyReputationReportResponseCorrections.md) |  |
**report** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) |  |
**responsePreparation** | [**MonthlyResponsePreparationReadiness**](MonthlyResponsePreparationReadiness.md) |  | [optional]
**preparedResponse** | [**MonthlyReputationReportResponsePreparation**](MonthlyReputationReportResponsePreparation.md) |  | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
