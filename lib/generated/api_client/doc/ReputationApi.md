# lythaus_api_client.api.ReputationApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**moderationLedgerAppealPost**](ReputationApi.md#moderationledgerappealpost) | **POST** /moderation/ledger/{entryId}/appeal | Appeal a reputation ledger entry
[**reputationLedgerGet**](ReputationApi.md#reputationledgerget) | **GET** /reputation/me/ledger | Get my reputation ledger
[**reputationMeGet**](ReputationApi.md#reputationmeget) | **GET** /reputation/me | Get my reputation summary
[**reputationUserGet**](ReputationApi.md#reputationuserget) | **GET** /reputation/users/{id} | Get public reputation view
[**reputationUserGetSingular**](ReputationApi.md#reputationusergetsingular) | **GET** /reputation/user/{id} | Get public reputation view


# **moderationLedgerAppealPost**
> AcceptedResponse moderationLedgerAppealPost(entryId)

Appeal a reputation ledger entry

Marks an appealable moderation-related ledger entry as under appeal for the authenticated owner.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReputationApi();
final String entryId = entryId_example; // String |

try {
    final response = api.moderationLedgerAppealPost(entryId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReputationApi->moderationLedgerAppealPost: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **entryId** | **String**|  |

### Return type

[**AcceptedResponse**](AcceptedResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **reputationLedgerGet**
> LedgerPage reputationLedgerGet(filter, cursor, limit)

Get my reputation ledger

Returns user-visible reputation events. Internal reason codes, raw deltas, authenticity scores, and anti-abuse scores are excluded.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReputationApi();
final String filter = filter_example; // String |
final String cursor = eyJsYXN0SWQiOiIwMThiMjdkNC01YjNiLTczZTMtYmY3Ny1iZjdiYjk1MzBmMjEiLCJ0cyI6MTcxNDQ3ODQwMH0; // String | Opaque pagination cursor returned in the previous response's `meta.nextCursor`
final int limit = 25; // int | Maximum number of items to return per page

try {
    final response = api.reputationLedgerGet(filter, cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReputationApi->reputationLedgerGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **filter** | **String**|  | [optional] [default to 'all']
 **cursor** | **String**| Opaque pagination cursor returned in the previous response's `meta.nextCursor` | [optional]
 **limit** | **int**| Maximum number of items to return per page | [optional] [default to 25]

### Return type

[**LedgerPage**](LedgerPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **reputationMeGet**
> ReputationSummary reputationMeGet()

Get my reputation summary

Returns the authenticated user's reputation level, band, pillar scores, and eligibility statuses. Raw formulas and internal risk scores are not returned.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReputationApi();

try {
    final response = api.reputationMeGet();
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReputationApi->reputationMeGet: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**ReputationSummary**](ReputationSummary.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **reputationUserGet**
> PublicReputationView reputationUserGet(id)

Get public reputation view

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReputationApi();
final String id = id_example; // String |

try {
    final response = api.reputationUserGet(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReputationApi->reputationUserGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**PublicReputationView**](PublicReputationView.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **reputationUserGetSingular**
> PublicReputationView reputationUserGetSingular(id)

Get public reputation view

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReputationApi();
final String id = id_example; // String |

try {
    final response = api.reputationUserGetSingular(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReputationApi->reputationUserGetSingular: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**PublicReputationView**](PublicReputationView.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
