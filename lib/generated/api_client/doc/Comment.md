# lythaus_api_client.model.Comment

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **String** |  |
**authorId** | **String** |  |
**parentId** | **String** |  | [optional]
**conversationId** | **String** | Canonical top-level comment for this conversation. | [optional]
**replyCount** | **int** | Visible non-deleted descendant replies for a root conversation at the page snapshot. Includes nested replies; excludes hidden and pending contributions. Reply rows report zero. | [optional]
**replyToAuthorId** | **String** |  | [optional]
**replyToDeleted** | **bool** |  | [optional]
**body** | **String** |  |
**depth** | **int** |  |
**declaredCreationMode** | [**DeclaredCreationMode**](DeclaredCreationMode.md) |  |
**moderationState** | [**ModerationState**](ModerationState.md) |  |
**deleted** | **bool** |  |
**createdAt** | [**DateTime**](DateTime.md) |  |
**updatedAt** | [**DateTime**](DateTime.md) |  | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
