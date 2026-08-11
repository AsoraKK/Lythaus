# lythaus_api_client.api.ModerationApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**contentFlagsCreate**](ModerationApi.md#contentflagscreate) | **POST** /content/flags | Submit a moderation flag
[**flagsCreate**](ModerationApi.md#flagscreate) | **POST** /flags | Submit a moderation flag


# **contentFlagsCreate**
> FlagCreateResponse contentFlagsCreate(flagCreateRequest, idempotencyKey)

Submit a moderation flag

Equivalent flag submission route for content-focused clients.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getModerationApi();
final FlagCreateRequest flagCreateRequest = ; // FlagCreateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.contentFlagsCreate(flagCreateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ModerationApi->contentFlagsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **flagCreateRequest** | [**FlagCreateRequest**](FlagCreateRequest.md)|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**FlagCreateResponse**](FlagCreateResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **flagsCreate**
> FlagCreateResponse flagsCreate(flagCreateRequest, idempotencyKey)

Submit a moderation flag

Records a neutral report for moderation review. Flags are evidence, not a public finding.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getModerationApi();
final FlagCreateRequest flagCreateRequest = {"contentType":"post","contentId":"018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b1a","reasonCode":"spam"}; // FlagCreateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.flagsCreate(flagCreateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ModerationApi->flagsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **flagCreateRequest** | [**FlagCreateRequest**](FlagCreateRequest.md)|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**FlagCreateResponse**](FlagCreateResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
