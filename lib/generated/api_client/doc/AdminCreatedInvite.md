# lythaus_api_client.model.AdminCreatedInvite

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**inviteId** | **String** |  |
**email** | **String** |  | [optional]
**createdBy** | **String** |  | [optional]
**createdAt** | [**DateTime**](DateTime.md) |  |
**expiresAt** | [**DateTime**](DateTime.md) |  |
**maxUses** | **int** |  |
**usageCount** | **int** |  |
**lastUsedAt** | [**DateTime**](DateTime.md) |  | [optional]
**status** | [**AdminInviteStatus**](AdminInviteStatus.md) |  |
**label** | **String** |  | [optional]
**usedByUserId** | **String** |  | [optional]
**inviteCode** | **String** | Returned exactly once when the invite is created. |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
