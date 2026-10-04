# lythaus_api_client.api.ReputationApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**adminMonthlyContextReview**](ReputationApi.md#adminmonthlycontextreview) | **POST** /admin/reputation/comments/{commentId}/context-review | Record a scoped contextual contribution review
[**downloadMyMonthlyReputationReportCsv**](ReputationApi.md#downloadmymonthlyreputationreportcsv) | **GET** /reputation/me/reports/monthly/{sourceMonth}/export.csv | Export my monthly reputation report as CSV
[**getMyMonthlyReputationReport**](ReputationApi.md#getmymonthlyreputationreport) | **GET** /reputation/me/reports/monthly/{sourceMonth} | Read or export my monthly reputation report
[**reputationLedgerGet**](ReputationApi.md#reputationledgerget) | **GET** /reputation/me/ledger | List my Reputation V2 ledger
[**reputationMeGet**](ReputationApi.md#reputationmeget) | **GET** /reputation/me | Get my private Reputation V2 summary
[**reputationUserGet**](ReputationApi.md#reputationuserget) | **GET** /reputation/users/{id} | Get public Reputation V2 summary
[**reputationUserGetSingular**](ReputationApi.md#reputationusergetsingular) | **GET** /reputation/user/{id} | Get public Reputation V2 summary (compatibility alias)


# **adminMonthlyContextReview**
> MonthlyContextReviewResponse adminMonthlyContextReview(commentId, monthlyContextReviewRequest)

Record a scoped contextual contribution review

Requires a verified Cloudflare Access JWT, active owner, administrator, or moderator membership authorised for this review, and an allowed Origin. The handler binds the reviewer to the current comment, thread and parent revisions. Actor identity and rules version come from server context. evidenceReference is a caller-supplied bounded opaque string stored as supplied; the API does not validate its target or sensitivity. Do not include raw content or secrets; this value is omitted from the response. The request cannot submit points. The route remains unavailable until its separate configuration and collection gates are enabled.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getReputationApi();
final String commentId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final MonthlyContextReviewRequest monthlyContextReviewRequest = ; // MonthlyContextReviewRequest |

try {
    final response = api.adminMonthlyContextReview(commentId, monthlyContextReviewRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReputationApi->adminMonthlyContextReview: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **commentId** | **String**|  |
 **monthlyContextReviewRequest** | [**MonthlyContextReviewRequest**](MonthlyContextReviewRequest.md)|  |

### Return type

[**MonthlyContextReviewResponse**](MonthlyContextReviewResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **downloadMyMonthlyReputationReportCsv**
> String downloadMyMonthlyReputationReportCsv(sourceMonth)

Export my monthly reputation report as CSV

Returns the authenticated member's private formula-safe CSV export for one calendar source month. Raw evidence identifiers and private ballots are omitted. The response is marked private and no-store.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReputationApi();
final String sourceMonth = sourceMonth_example; // String | Calendar source month in UTC, formatted YYYY-MM.

try {
    final response = api.downloadMyMonthlyReputationReportCsv(sourceMonth);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReputationApi->downloadMyMonthlyReputationReportCsv: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **sourceMonth** | **String**| Calendar source month in UTC, formatted YYYY-MM. |

### Return type

**String**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: text/csv, application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getMyMonthlyReputationReport**
> MonthlyReputationReportResponse getMyMonthlyReputationReport(sourceMonth)

Read or export my monthly reputation report

Returns the authenticated member's private JSON report for one calendar source month. It includes selected and omitted assigned weeks, action allowances and accepted/withheld/pending totals, monthly and quarterly email validity, fixed next-calendar-month authority, and correction history. Raw evidence identifiers and private ballots are not returned. The report may remain pending while policy or settlement gates are unresolved.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReputationApi();
final String sourceMonth = sourceMonth_example; // String | Calendar source month in UTC, formatted YYYY-MM.

try {
    final response = api.getMyMonthlyReputationReport(sourceMonth);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReputationApi->getMyMonthlyReputationReport: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **sourceMonth** | **String**| Calendar source month in UTC, formatted YYYY-MM. |

### Return type

[**MonthlyReputationReportResponse**](MonthlyReputationReportResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **reputationLedgerGet**
> ReputationLedgerPage reputationLedgerGet(cursor, limit)

List my Reputation V2 ledger

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReputationApi();
final String cursor = cursor_example; // String | Opaque keyset cursor returned by the preceding page.
final int limit = 56; // int |

try {
    final response = api.reputationLedgerGet(cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling ReputationApi->reputationLedgerGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**| Opaque keyset cursor returned by the preceding page. | [optional]
 **limit** | **int**|  | [optional] [default to 25]

### Return type

[**ReputationLedgerPage**](ReputationLedgerPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **reputationMeGet**
> ReputationPrivateV2 reputationMeGet()

Get my private Reputation V2 summary

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

[**ReputationPrivateV2**](ReputationPrivateV2.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **reputationUserGet**
> ReputationPublicV2 reputationUserGet(id)

Get public Reputation V2 summary

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReputationApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

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

[**ReputationPublicV2**](ReputationPublicV2.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **reputationUserGetSingular**
> ReputationPublicV2 reputationUserGetSingular(id)

Get public Reputation V2 summary (compatibility alias)

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getReputationApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

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

[**ReputationPublicV2**](ReputationPublicV2.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
