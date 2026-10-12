# lythaus_api_client.api.PrivacyApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**getActivityMeasurementConsent**](PrivacyApi.md#getactivitymeasurementconsent) | **GET** /analytics/activity-consent | Read own account-linked activity consent
[**privacyRequestCreate**](PrivacyApi.md#privacyrequestcreate) | **POST** /privacy/requests | Submit an asynchronous privacy request
[**privacyRequestExportDownload**](PrivacyApi.md#privacyrequestexportdownload) | **GET** /privacy/requests/{requestId}/export | Download my completed privacy export
[**privacyRequestStatus**](PrivacyApi.md#privacyrequeststatus) | **GET** /privacy/requests | Get the latest privacy request status
[**recordForegroundActivityDay**](PrivacyApi.md#recordforegroundactivityday) | **POST** /analytics/activity | Record one canonical account and UTC active day
[**setActivityMeasurementConsent**](PrivacyApi.md#setactivitymeasurementconsent) | **PUT** /analytics/activity-consent | Explicitly grant or withdraw this account-linked purpose
[**storageUsageGet**](PrivacyApi.md#storageusageget) | **GET** /storage/usage | Get the authenticated user&#39;s private storage ledger
[**usersMeRegionUpdate**](PrivacyApi.md#usersmeregionupdate) | **PUT** /users/me/region | Update private region and visibility preferences
[**usersMeRetentionUpdate**](PrivacyApi.md#usersmeretentionupdate) | **PUT** /users/me/retention | Update a private content-retention rule


# **getActivityMeasurementConsent**
> ActivityConsent getActivityMeasurementConsent()

Read own account-linked activity consent

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyApi();

try {
    final response = api.getActivityMeasurementConsent();
    print(response);
} catch on DioException (e) {
    print('Exception when calling PrivacyApi->getActivityMeasurementConsent: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**ActivityConsent**](ActivityConsent.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **privacyRequestCreate**
> PrivacyRequestAccepted privacyRequestCreate(privacyRequestCreate, idempotencyKey)

Submit an asynchronous privacy request

Records an export, account deletion, or rectification request and queues it for durable processing. Acceptance does not mean processing is complete.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyApi();
final PrivacyRequestCreate privacyRequestCreate = {"requestType":"export"}; // PrivacyRequestCreate |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

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
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

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

# **recordForegroundActivityDay**
> RecordForegroundActivityDay200Response recordForegroundActivityDay(activityRenderInput)

Record one canonical account and UTC active day

Authenticated visible foreground render only, including an empty feed. No background heartbeat, browsing URL, content, identity or client timestamp is accepted. Server deduplication and current consent episode checks are transactional. Signal is client-asserted visibility, not human-attention attestation. Existing authenticated origin/CSRF and rate limits are dispatcher prerequisites.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyApi();
final ActivityRenderInput activityRenderInput = ; // ActivityRenderInput |

try {
    final response = api.recordForegroundActivityDay(activityRenderInput);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PrivacyApi->recordForegroundActivityDay: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **activityRenderInput** | [**ActivityRenderInput**](ActivityRenderInput.md)|  |

### Return type

[**RecordForegroundActivityDay200Response**](RecordForegroundActivityDay200Response.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **setActivityMeasurementConsent**
> ActivityConsent setActivityMeasurementConsent(activityConsentInput)

Explicitly grant or withdraw this account-linked purpose

Existing anonymous consent does not authorize this purpose. Withdrawal remains possible while collection is disabled; dates are removed transactionally unless an existing legal hold requires preservation. Held dates are excluded from metrics and collection. Activation also requires approved retention terms. Existing account consent decisions remain exportable. Existing authenticated origin/CSRF and rate limits are mandatory dispatcher prerequisites.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyApi();
final ActivityConsentInput activityConsentInput = ; // ActivityConsentInput |

try {
    final response = api.setActivityMeasurementConsent(activityConsentInput);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PrivacyApi->setActivityMeasurementConsent: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **activityConsentInput** | [**ActivityConsentInput**](ActivityConsentInput.md)|  |

### Return type

[**ActivityConsent**](ActivityConsent.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **storageUsageGet**
> StorageUsageGet200Response storageUsageGet()

Get the authenticated user's private storage ledger

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyApi();

try {
    final response = api.storageUsageGet();
    print(response);
} catch on DioException (e) {
    print('Exception when calling PrivacyApi->storageUsageGet: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**StorageUsageGet200Response**](StorageUsageGet200Response.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **usersMeRegionUpdate**
> UsersMeRegionUpdate200Response usersMeRegionUpdate(idempotencyKey, usersMeRegionUpdateRequest)

Update private region and visibility preferences

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyApi();
final String idempotencyKey = idempotencyKey_example; // String | Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed.
final UsersMeRegionUpdateRequest usersMeRegionUpdateRequest = ; // UsersMeRegionUpdateRequest |

try {
    final response = api.usersMeRegionUpdate(idempotencyKey, usersMeRegionUpdateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PrivacyApi->usersMeRegionUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **idempotencyKey** | **String**| Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. |
 **usersMeRegionUpdateRequest** | [**UsersMeRegionUpdateRequest**](UsersMeRegionUpdateRequest.md)|  |

### Return type

[**UsersMeRegionUpdate200Response**](UsersMeRegionUpdate200Response.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **usersMeRetentionUpdate**
> UsersMeRetentionUpdate200Response usersMeRetentionUpdate(idempotencyKey, usersMeRetentionUpdateRequest)

Update a private content-retention rule

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyApi();
final String idempotencyKey = idempotencyKey_example; // String | Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed.
final UsersMeRetentionUpdateRequest usersMeRetentionUpdateRequest = ; // UsersMeRetentionUpdateRequest |

try {
    final response = api.usersMeRetentionUpdate(idempotencyKey, usersMeRetentionUpdateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PrivacyApi->usersMeRetentionUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **idempotencyKey** | **String**| Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. |
 **usersMeRetentionUpdateRequest** | [**UsersMeRetentionUpdateRequest**](UsersMeRetentionUpdateRequest.md)|  |

### Return type

[**UsersMeRetentionUpdate200Response**](UsersMeRetentionUpdate200Response.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
