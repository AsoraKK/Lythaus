# lythaus_api_client.model.WaitlistAdminItem

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **String** |  |
**email** | **String** |  |
**status** | **String** |  |
**source_** | **String** |  |
**createdAt** | [**DateTime**](DateTime.md) |  |
**invitedAt** | [**DateTime**](DateTime.md) |  | [optional]
**convertedAt** | [**DateTime**](DateTime.md) |  | [optional]
**unsubscribedAt** | [**DateTime**](DateTime.md) |  | [optional]
**retentionHold** | **bool** | Whether a retention hold prevents automatic waitlist-record purging. |
**linkedAccount** | [**WaitlistAdminItemLinkedAccount**](WaitlistAdminItemLinkedAccount.md) |  | [optional]

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
