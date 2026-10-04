# lythaus_api_client.model.AppealDetailResponseAppeal

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **String** |  |
**caseId** | **String** |  |
**state** | **String** |  |
**riskClass** | **String** |  |
**policyVersion** | **String** |  |
**createdAt** | [**DateTime**](DateTime.md) |  |
**expiresAt** | [**DateTime**](DateTime.md) |  | [optional]
**resolvedAt** | [**DateTime**](DateTime.md) |  | [optional]
**reviewerPanelDecision** | **String** |  | [optional]
**finalDecision** | **String** |  | [optional]
**completedReviewers** | **int** |  | [optional]
**outcomeState** | **String** |  | [optional]
**reviewerAssigned** | **bool** |  | [optional]
**reviewerDecision** | **String** |  | [optional]
**appealId** | **String** |  |
**policyVersion** | **String** |  |
**rulesVersion** | **String** |  |
**reviewClass** | **String** |  |
**opensAt** | [**DateTime**](DateTime.md) |  |
**closesAt** | [**DateTime**](DateTime.md) |  |
**extensions** | **int** |  |
**question** | **String** |  |
**ownBallot** | [**CommunityOwnBallot**](CommunityOwnBallot.md) |  |
**outcome** | [**CommunityAppealOutcome**](CommunityAppealOutcome.md) |  |
**evidence** | [**CommunityAppealEvidence**](CommunityAppealEvidence.md) |  |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
