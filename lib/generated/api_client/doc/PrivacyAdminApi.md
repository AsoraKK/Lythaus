# lythaus_api_client.api.PrivacyAdminApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**clearLegalHold**](PrivacyAdminApi.md#clearlegalhold) | **POST** /admin/legal-hold/clear | Clear an existing legal hold
[**enqueueDsrDelete**](PrivacyAdminApi.md#enqueuedsrdelete) | **POST** /_admin/dsr/delete | Enqueue a Data Subject Request delete
[**enqueueDsrExport**](PrivacyAdminApi.md#enqueuedsrexport) | **POST** /_admin/dsr/export | Enqueue a Data Subject Request export
[**placeLegalHold**](PrivacyAdminApi.md#placelegalhold) | **POST** /admin/legal-hold/place | Place a legal hold


# **clearLegalHold**
> clearLegalHold(legalHoldClear)

Clear an existing legal hold

Removes a previously placed legal hold, allowing normal data lifecycle operations (including deletion) to resume.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyAdminApi();
final LegalHoldClear legalHoldClear = ; // LegalHoldClear |

try {
    api.clearLegalHold(legalHoldClear);
} catch on DioException (e) {
    print('Exception when calling PrivacyAdminApi->clearLegalHold: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **legalHoldClear** | [**LegalHoldClear**](LegalHoldClear.md)|  |

### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **enqueueDsrDelete**
> DsrRequestSummary enqueueDsrDelete(dsrRequestInput)

Enqueue a Data Subject Request delete

Queues a deletion job for a user's data as part of GDPR/CCPA right-to-erasure compliance. Returns immediately with job tracking info.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyAdminApi();
final DsrRequestInput dsrRequestInput = ; // DsrRequestInput |

try {
    final response = api.enqueueDsrDelete(dsrRequestInput);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PrivacyAdminApi->enqueueDsrDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **dsrRequestInput** | [**DsrRequestInput**](DsrRequestInput.md)|  |

### Return type

[**DsrRequestSummary**](DsrRequestSummary.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **enqueueDsrExport**
> DsrRequestSummary enqueueDsrExport(dsrRequestInput)

Enqueue a Data Subject Request export

Queues an export job for a user's data as part of GDPR/CCPA compliance. Returns immediately with job tracking info.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyAdminApi();
final DsrRequestInput dsrRequestInput = {"userId":"018b27d4-5b3b-73e3-bf77-bf7bb9530f21","note":"User requested a copy of their account data."}; // DsrRequestInput |

try {
    final response = api.enqueueDsrExport(dsrRequestInput);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PrivacyAdminApi->enqueueDsrExport: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **dsrRequestInput** | [**DsrRequestInput**](DsrRequestInput.md)|  |

### Return type

[**DsrRequestSummary**](DsrRequestSummary.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **placeLegalHold**
> LegalHoldRecord placeLegalHold(legalHoldInput)

Place a legal hold

Places a legal hold on a user's data, preventing deletion until the hold is cleared. Used for litigation or regulatory preservation.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPrivacyAdminApi();
final LegalHoldInput legalHoldInput = ; // LegalHoldInput |

try {
    final response = api.placeLegalHold(legalHoldInput);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PrivacyAdminApi->placeLegalHold: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **legalHoldInput** | [**LegalHoldInput**](LegalHoldInput.md)|  |

### Return type

[**LegalHoldRecord**](LegalHoldRecord.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
