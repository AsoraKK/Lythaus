# lythaus_api_client.model.EmailSessionResponse

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**accessToken** | **String** | Short-lived JWT bearer token (15 minutes). |
**refreshToken** | **String** | Rotating opaque refresh token, only in native/legacy transport. Never returned to cookie-v1 clients. | [optional]
**sessionTransport** | **String** |  | [optional]
**tokenType** | **String** |  |
**expiresIn** | **int** | Access-token lifetime in seconds. |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
