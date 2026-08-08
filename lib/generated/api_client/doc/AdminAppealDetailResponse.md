# lythaus_api_client.model.AdminAppealDetailResponse

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**appealId** | **String** |  | [optional]
**targetType** | [**AdminAppealTargetType**](AdminAppealTargetType.md) |  | [optional]
**targetId** | **String** |  | [optional]
**status** | [**AdminAppealStatusDetail**](AdminAppealStatusDetail.md) |  | [optional]
**createdAt** | [**DateTime**](DateTime.md) |  | [optional]
**lastUpdatedAt** | [**DateTime**](DateTime.md) |  | [optional]
**votes** | [**AdminAppealVoteSummary**](AdminAppealVoteSummary.md) |  | [optional]
**quorum** | [**AdminAppealQuorumSummary**](AdminAppealQuorumSummary.md) |  | [optional]
**moderatorOverrideAllowed** | **bool** |  | [optional]
**finalDecision** | [**AdminAppealFinalDecision**](AdminAppealFinalDecision.md) |  | [optional]
**auditSummary** | [**AdminAppealAuditSummary**](AdminAppealAuditSummary.md) |  | [optional]
**appeal** | [**AdminAppealDetail**](AdminAppealDetail.md) |  | [optional]
**content** | [**AdminAppealContent**](AdminAppealContent.md) |  | [optional]
**originalDecision** | [**AdminAppealOriginalDecision**](AdminAppealOriginalDecision.md) |  | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
