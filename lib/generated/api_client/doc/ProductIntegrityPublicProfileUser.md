# lythaus_api_client.model.ProductIntegrityPublicProfileUser

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **String** |  |
**displayName** | **String** |  |
**handle** | **String** |  | [optional]
**avatarUrl** | **String** |  | [optional]
**bio** | **String** |  | [optional]
**trustPassportVisibility** | **String** | Persisted Passport visibility preference. Private suppresses the public reputation summary. |
**reputation** | [**ProductIntegrityPublicProfileUserReputation**](ProductIntegrityPublicProfileUserReputation.md) |  | [optional]
**journalistVerified** | **bool** |  |
**badges** | [**BuiltList&lt;BuiltMap&lt;String, JsonObject&gt;&gt;**](BuiltMap.md) |  |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
