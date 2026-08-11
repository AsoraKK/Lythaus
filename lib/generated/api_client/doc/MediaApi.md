# lythaus_api_client.api.MediaApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**mediaUploadsCreate**](MediaApi.md#mediauploadscreate) | **POST** /media/uploads | Create a quarantined media upload session
[**mediaUploadsFinalise**](MediaApi.md#mediauploadsfinalise) | **POST** /media/uploads/{uploadSessionId}/finalise | Finalise a quarantined media upload


# **mediaUploadsCreate**
> MediaUploadSessionCreated mediaUploadsCreate(mediaUploadSessionCreateRequest, idempotencyKey)

Create a quarantined media upload session

Creates a signed private upload session; the uploaded object remains quarantined until finalisation and review.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getMediaApi();
final MediaUploadSessionCreateRequest mediaUploadSessionCreateRequest = ; // MediaUploadSessionCreateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.mediaUploadsCreate(mediaUploadSessionCreateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling MediaApi->mediaUploadsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **mediaUploadSessionCreateRequest** | [**MediaUploadSessionCreateRequest**](MediaUploadSessionCreateRequest.md)|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**MediaUploadSessionCreated**](MediaUploadSessionCreated.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **mediaUploadsFinalise**
> MediaUploadFinaliseResponse mediaUploadsFinalise(uploadSessionId, idempotencyKey)

Finalise a quarantined media upload

Verifies the uploaded object size and SHA-256 checksum, then queues private media review.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getMediaApi();
final String uploadSessionId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.mediaUploadsFinalise(uploadSessionId, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling MediaApi->mediaUploadsFinalise: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **uploadSessionId** | **String**|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**MediaUploadFinaliseResponse**](MediaUploadFinaliseResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
