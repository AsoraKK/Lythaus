# lythaus_api_client.api.PrivacyApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**privacyRequestCreate**](PrivacyApi.md#privacyrequestcreate) | **POST** /privacy/requests | Submit an asynchronous privacy request
[**privacyRequestExportDownload**](PrivacyApi.md#privacyrequestexportdownload) | **GET** /privacy/requests/{requestId}/export | Download my completed privacy export
[**privacyRequestStatus**](PrivacyApi.md#privacyrequeststatus) | **GET** /privacy/requests | Get the latest privacy request status


# **privacyRequestCreate**
> PrivacyRequestAccepted privacyRequestCreate(privacyRequestCreate, idempotencyKey)

Submit an asynchronous privacy request

Records an export, account deletion, or rectification request and queues it for durable processing. Acceptance does not mean processing is complete.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyApi();
final PrivacyRequestCreate privacyRequestCreate = ; // PrivacyRequestCreate |
final String idempotencyKey = idempotencyKey_example; // String |

try {
    final response = api.privacyRequestCreate(privacyRequestCreate, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PrivacyApi->privacyRequestCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **privacyRequestCreate** | [**PrivacyRequestCreate**](PrivacyRequestCreate.md)|  |
 **idempotencyKey** | **String**|  | [optional]

### Return type

[**PrivacyRequestAccepted**](PrivacyRequestAccepted.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **privacyRequestExportDownload**
> BuiltMap<String, JsonObject> privacyRequestExportDownload(requestId)

Download my completed privacy export

Streams the authenticated subject's unexpired completed export as a private JSON attachment. The success payload is the export file itself, not an API envelope. Access is recorded as the `privacy.export_accessed` activity event.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyApi();
final String requestId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.privacyRequestExportDownload(requestId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PrivacyApi->privacyRequestExportDownload: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestId** | **String**|  |

### Return type

[**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **privacyRequestStatus**
> PrivacyRequestStatusResponse privacyRequestStatus(requestType)

Get the latest privacy request status

Returns the authenticated user's latest matching asynchronous privacy request.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyApi();
final String requestType = requestType_example; // String |

try {
    final response = api.privacyRequestStatus(requestType);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PrivacyApi->privacyRequestStatus: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **requestType** | **String**|  | [optional]

### Return type

[**PrivacyRequestStatusResponse**](PrivacyRequestStatusResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
