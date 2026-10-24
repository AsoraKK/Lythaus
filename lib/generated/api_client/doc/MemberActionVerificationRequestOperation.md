# lythaus_api_client.model.MemberActionVerificationRequestOperation

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**method** | **String** |  |
**path** | **String** | Exact canonical /api path and query of the intended reward redemption or privacy deletion request. Actor, action and session identity are derived by the server. |
**body** | **String** | Exact UTF-8 body text used by the mutation, at most 8192 bytes. Reward redemption may use an empty body; privacy deletion uses requestType delete JSON. Whitespace, property order and query bytes are bound to the proof. |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
