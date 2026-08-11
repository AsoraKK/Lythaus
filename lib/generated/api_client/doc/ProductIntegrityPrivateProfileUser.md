# lythaus_api_client.model.ProductIntegrityPrivateProfileUser

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
**trustPassportVisibility** | **String** |  |
**reputationLevel** | **int** |  |
**reputation** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) |  | [optional]
**journalistVerified** | **bool** |  | [optional]
**badges** | [**BuiltList&lt;BuiltMap&lt;String, JsonObject&gt;&gt;**](BuiltMap.md) |  | [optional]
**subscriptionTier** | **String** |  |
**accountabilityIdentityDeclared** | **bool** | Whether a private accountability name is stored. This is not a verification claim and never discloses the name. |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
