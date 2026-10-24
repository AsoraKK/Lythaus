# lythaus_api_client.model.MemberActionVerificationReceipt

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**proof** | **String** | Opaque one-use proof, bound to this account/session/action/request. Send only to the intended API in X-Lythaus-Action-Verification; do not persist, log or forward on redirects. |
**verifiedAt** | [**DateTime**](DateTime.md) |  |
**expiresAt** | [**DateTime**](DateTime.md) | Exactly five minutes after verifiedAt, enforced using server DB time. |
**action** | **String** |  |
**maintenanceEvidence** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) | Optional evidence-collection outcome only. Inactive or unavailable collection never implies monthly eligibility, protection coverage, a point award or a reputation deduction. |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
