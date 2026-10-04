# lythaus_api_client.model.MonthlyContextReviewRequest

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**rubricVersion** | **String** |  |
**sourceRevisionId** | **String** |  |
**threadRevisionId** | **String** |  |
**parentRevisionId** | **String** |  |
**decision** | **String** |  |
**reasonCode** | **String** |  |
**evidenceReference** | **String** | Caller-supplied bounded opaque string stored as supplied; the API does not validate its target or sensitivity. Do not include raw content or secrets. This value is omitted from the response. |
**expectedRevision** | **int** |  |
**idempotencyKey** | **String** |  |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
