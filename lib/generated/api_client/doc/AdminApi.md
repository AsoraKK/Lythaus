# lythaus_api_client.api.AdminApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**adminAppealsApprove**](AdminApi.md#adminappealsapprove) | **POST** /_admin/appeals/{appealId}/approve | Approve an appeal
[**adminAppealsGet**](AdminApi.md#adminappealsget) | **GET** /_admin/appeals/{appealId} | Get appeal detail
[**adminAppealsList**](AdminApi.md#adminappealslist) | **GET** /_admin/appeals | List appeals queue
[**adminAppealsOverride**](AdminApi.md#adminappealsoverride) | **POST** /_admin/appeals/{appealId}/override | Override an appeal
[**adminAppealsReject**](AdminApi.md#adminappealsreject) | **POST** /_admin/appeals/{appealId}/reject | Reject an appeal
[**adminAuditList**](AdminApi.md#adminauditlist) | **GET** /_admin/audit | List admin audit log entries
[**adminBudgetGet**](AdminApi.md#adminbudgetget) | **GET** /_admin/budget | Get budget configuration
[**adminBudgetUpdate**](AdminApi.md#adminbudgetupdate) | **PUT** /_admin/budget | Update budget configuration
[**adminConfigGet**](AdminApi.md#adminconfigget) | **GET** /_admin/config | Get admin runtime configuration
[**adminConfigPublicGet**](AdminApi.md#adminconfigpublicget) | **GET** /admin/config | Get public admin configuration
[**adminConfigPublicUpdate**](AdminApi.md#adminconfigpublicupdate) | **PUT** /admin/config | Update public admin configuration
[**adminConfigUpdate**](AdminApi.md#adminconfigupdate) | **PUT** /_admin/config | Update admin runtime configuration
[**adminContentBlock**](AdminApi.md#admincontentblock) | **POST** /_admin/content/{contentId}/block | Block content
[**adminContentPublish**](AdminApi.md#admincontentpublish) | **POST** /_admin/content/{contentId}/publish | Publish content
[**adminDsrCancel**](AdminApi.md#admindsrcancel) | **POST** /_admin/dsr/{id}/cancel | Cancel a data subject request
[**adminDsrDownload**](AdminApi.md#admindsrdownload) | **GET** /_admin/dsr/{id}/download | Download data subject request export
[**adminDsrGet**](AdminApi.md#admindsrget) | **GET** /_admin/dsr/{id} | Get data subject request detail
[**adminDsrLegalHoldClear**](AdminApi.md#admindsrlegalholdclear) | **POST** /_admin/dsr/legal-holds/{id}/clear | Clear a legal hold
[**adminDsrLegalHoldPlace**](AdminApi.md#admindsrlegalholdplace) | **POST** /_admin/dsr/legal-holds | Place a legal hold
[**adminDsrList**](AdminApi.md#admindsrlist) | **GET** /_admin/dsr | List data subject requests
[**adminDsrRelease**](AdminApi.md#admindsrrelease) | **POST** /_admin/dsr/{id}/release | Release a data subject request
[**adminDsrRetry**](AdminApi.md#admindsrretry) | **POST** /_admin/dsr/{id}/retry | Retry a failed data subject request
[**adminDsrReviewA**](AdminApi.md#admindsrreviewa) | **POST** /_admin/dsr/{id}/reviewA | First-reviewer decision on DSR
[**adminDsrReviewB**](AdminApi.md#admindsrreviewb) | **POST** /_admin/dsr/{id}/reviewB | Second-reviewer decision on DSR
[**adminFlagsGet**](AdminApi.md#adminflagsget) | **GET** /_admin/flags/{flagId} | Get a flagged content detail
[**adminFlagsList**](AdminApi.md#adminflagslist) | **GET** /_admin/flags | List flagged content queue
[**adminFlagsResolve**](AdminApi.md#adminflagsresolve) | **POST** /_admin/flags/{flagId}/resolve | Resolve a flagged content item
[**adminInvitesBatch**](AdminApi.md#admininvitesbatch) | **POST** /_admin/invites/batch | Batch create invite codes
[**adminInvitesCreate**](AdminApi.md#admininvitescreate) | **POST** /_admin/invites | Create an invite code
[**adminInvitesDelete**](AdminApi.md#admininvitesdelete) | **DELETE** /_admin/invites/{inviteId} | Revoke an Alpha invite
[**adminInvitesGet**](AdminApi.md#admininvitesget) | **GET** /_admin/invites/{inviteId} | Get an Alpha invite
[**adminInvitesList**](AdminApi.md#admininviteslist) | **GET** /_admin/invites | List Alpha invites
[**adminInvitesRevoke**](AdminApi.md#admininvitesrevoke) | **POST** /_admin/invites/{inviteId}/revoke | Revoke an invite code
[**adminModerationClassReset**](AdminApi.md#adminmoderationclassreset) | **POST** /admin/moderation-classes/{className}/reset | Reset a moderation class to defaults
[**adminModerationClassesList**](AdminApi.md#adminmoderationclasseslist) | **GET** /admin/moderation-classes | List moderation label classes
[**adminModerationWeightsUpdate**](AdminApi.md#adminmoderationweightsupdate) | **POST** /admin/moderation-classes/weights | Bulk-update moderation class weights
[**adminNewsIngest**](AdminApi.md#adminnewsingest) | **POST** /_admin/news/ingest | Ingest news items into the news board
[**adminOpsMetrics**](AdminApi.md#adminopsmetrics) | **GET** /_admin/ops/metrics | Get operational metrics
[**adminOpsStateGet**](AdminApi.md#adminopsstateget) | **GET** /_admin/ops/state | Get operational state flags
[**adminOpsStateUpdate**](AdminApi.md#adminopsstateupdate) | **PUT** /_admin/ops/state | Update operational state flags
[**adminSetUserTier**](AdminApi.md#adminsetusertier) | **PATCH** /admin/users/{userId}/tier | Set user subscription tier
[**adminTestDataPurge**](AdminApi.md#admintestdatapurge) | **POST** /admin/test-data/purge | Purge test data outside production
[**adminUsersDisable**](AdminApi.md#adminusersdisable) | **POST** /_admin/users/{userId}/disable | Disable a user
[**adminUsersEnable**](AdminApi.md#adminusersenable) | **POST** /_admin/users/{userId}/enable | Enable a user
[**adminUsersSearch**](AdminApi.md#adminuserssearch) | **GET** /_admin/users/search | Search users


# **adminAppealsApprove**
> AdminAppealDecisionResponse adminAppealsApprove(appealId, adminAppealDecisionRequest)

Approve an appeal

Approves an appeal and restores content to PUBLISHED. Overrides existing outcomes.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String appealId = appealId_example; // String | Appeal identifier
final AdminAppealDecisionRequest adminAppealDecisionRequest = ; // AdminAppealDecisionRequest |

try {
    final response = api.adminAppealsApprove(appealId, adminAppealDecisionRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAppealsApprove: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **appealId** | **String**| Appeal identifier |
 **adminAppealDecisionRequest** | [**AdminAppealDecisionRequest**](AdminAppealDecisionRequest.md)|  |

### Return type

[**AdminAppealDecisionResponse**](AdminAppealDecisionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAppealsGet**
> AdminAppealDetailResponse adminAppealsGet(appealId)

Get appeal detail

Fetch appeal detail with content and decision context.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String appealId = appealId_example; // String | Appeal identifier

try {
    final response = api.adminAppealsGet(appealId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAppealsGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **appealId** | **String**| Appeal identifier |

### Return type

[**AdminAppealDetailResponse**](AdminAppealDetailResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAppealsList**
> AdminAppealQueueResponse adminAppealsList(status, cursor, limit)

List appeals queue

Returns appeals awaiting admin review.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String status = status_example; // String | Filter by appeal status
final String cursor = cursor_example; // String | Cursor for pagination
final int limit = 56; // int | Number of items to return (1-100)

try {
    final response = api.adminAppealsList(status, cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAppealsList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **status** | **String**| Filter by appeal status | [optional]
 **cursor** | **String**| Cursor for pagination | [optional]
 **limit** | **int**| Number of items to return (1-100) | [optional]

### Return type

[**AdminAppealQueueResponse**](AdminAppealQueueResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAppealsOverride**
> AdminAppealOverrideResponse adminAppealsOverride(appealId, adminAppealOverrideRequest, idempotencyKey)

Override an appeal

Moderator override for appeal outcomes. Idempotent per appeal.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String appealId = appealId_example; // String | Appeal identifier
final AdminAppealOverrideRequest adminAppealOverrideRequest = ; // AdminAppealOverrideRequest |
final String idempotencyKey = idempotencyKey_example; // String | Idempotency key for safe retries

try {
    final response = api.adminAppealsOverride(appealId, adminAppealOverrideRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAppealsOverride: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **appealId** | **String**| Appeal identifier |
 **adminAppealOverrideRequest** | [**AdminAppealOverrideRequest**](AdminAppealOverrideRequest.md)|  |
 **idempotencyKey** | **String**| Idempotency key for safe retries | [optional]

### Return type

[**AdminAppealOverrideResponse**](AdminAppealOverrideResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAppealsReject**
> AdminAppealDecisionResponse adminAppealsReject(appealId, adminAppealDecisionRequest)

Reject an appeal

Rejects an appeal and keeps content BLOCKED. Overrides existing outcomes.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String appealId = appealId_example; // String | Appeal identifier
final AdminAppealDecisionRequest adminAppealDecisionRequest = ; // AdminAppealDecisionRequest |

try {
    final response = api.adminAppealsReject(appealId, adminAppealDecisionRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAppealsReject: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **appealId** | **String**| Appeal identifier |
 **adminAppealDecisionRequest** | [**AdminAppealDecisionRequest**](AdminAppealDecisionRequest.md)|  |

### Return type

[**AdminAppealDecisionResponse**](AdminAppealDecisionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAuditList**
> AdminAuditListResponse adminAuditList(limit)

List admin audit log entries

Returns recent admin audit entries.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final int limit = 56; // int | Number of entries to return (1-200)

try {
    final response = api.adminAuditList(limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAuditList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **limit** | **int**| Number of entries to return (1-200) | [optional]

### Return type

[**AdminAuditListResponse**](AdminAuditListResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminBudgetGet**
> JsonObject adminBudgetGet()

Get budget configuration

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminBudgetGet();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminBudgetGet: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminBudgetUpdate**
> JsonObject adminBudgetUpdate(body)

Update budget configuration

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminBudgetUpdate(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminBudgetUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminConfigGet**
> JsonObject adminConfigGet()

Get admin runtime configuration

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminConfigGet();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminConfigGet: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminConfigPublicGet**
> JsonObject adminConfigPublicGet()

Get public admin configuration

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminConfigPublicGet();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminConfigPublicGet: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminConfigPublicUpdate**
> JsonObject adminConfigPublicUpdate(body)

Update public admin configuration

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminConfigPublicUpdate(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminConfigPublicUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminConfigUpdate**
> JsonObject adminConfigUpdate(body)

Update admin runtime configuration

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminConfigUpdate(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminConfigUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminContentBlock**
> AdminContentActionResponse adminContentBlock(contentId, adminContentActionRequest)

Block content

Sets content state to BLOCKED.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String contentId = contentId_example; // String | Content identifier
final AdminContentActionRequest adminContentActionRequest = ; // AdminContentActionRequest |

try {
    final response = api.adminContentBlock(contentId, adminContentActionRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminContentBlock: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **contentId** | **String**| Content identifier |
 **adminContentActionRequest** | [**AdminContentActionRequest**](AdminContentActionRequest.md)|  |

### Return type

[**AdminContentActionResponse**](AdminContentActionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminContentPublish**
> AdminContentActionResponse adminContentPublish(contentId, adminContentActionRequest)

Publish content

Sets content state to PUBLISHED.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String contentId = contentId_example; // String | Content identifier
final AdminContentActionRequest adminContentActionRequest = ; // AdminContentActionRequest |

try {
    final response = api.adminContentPublish(contentId, adminContentActionRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminContentPublish: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **contentId** | **String**| Content identifier |
 **adminContentActionRequest** | [**AdminContentActionRequest**](AdminContentActionRequest.md)|  |

### Return type

[**AdminContentActionResponse**](AdminContentActionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminDsrCancel**
> JsonObject adminDsrCancel(id, body)

Cancel a data subject request

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminDsrCancel(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminDsrCancel: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminDsrDownload**
> JsonObject adminDsrDownload(id)

Download data subject request export

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String id = id_example; // String |

try {
    final response = api.adminDsrDownload(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminDsrDownload: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminDsrGet**
> JsonObject adminDsrGet(id)

Get data subject request detail

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String id = id_example; // String |

try {
    final response = api.adminDsrGet(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminDsrGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminDsrLegalHoldClear**
> JsonObject adminDsrLegalHoldClear(id, body)

Clear a legal hold

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminDsrLegalHoldClear(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminDsrLegalHoldClear: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminDsrLegalHoldPlace**
> JsonObject adminDsrLegalHoldPlace(body)

Place a legal hold

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminDsrLegalHoldPlace(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminDsrLegalHoldPlace: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminDsrList**
> JsonObject adminDsrList()

List data subject requests

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminDsrList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminDsrList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminDsrRelease**
> JsonObject adminDsrRelease(id, body)

Release a data subject request

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminDsrRelease(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminDsrRelease: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminDsrRetry**
> JsonObject adminDsrRetry(id, body)

Retry a failed data subject request

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminDsrRetry(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminDsrRetry: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminDsrReviewA**
> JsonObject adminDsrReviewA(id, body)

First-reviewer decision on DSR

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminDsrReviewA(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminDsrReviewA: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminDsrReviewB**
> JsonObject adminDsrReviewB(id, body)

Second-reviewer decision on DSR

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminDsrReviewB(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminDsrReviewB: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminFlagsGet**
> AdminFlagDetailResponse adminFlagsGet(flagId)

Get a flagged content detail

Fetch details for a flagged content item.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String flagId = flagId_example; // String | Flag identifier

try {
    final response = api.adminFlagsGet(flagId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminFlagsGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **flagId** | **String**| Flag identifier |

### Return type

[**AdminFlagDetailResponse**](AdminFlagDetailResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminFlagsList**
> AdminFlagQueueResponse adminFlagsList(status, cursor, limit)

List flagged content queue

Returns grouped flagged content for admin triage.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String status = status_example; // String | Filter by queue status
final String cursor = cursor_example; // String | Cursor for pagination
final int limit = 56; // int | Number of items to return (1-100)

try {
    final response = api.adminFlagsList(status, cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminFlagsList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **status** | **String**| Filter by queue status | [optional]
 **cursor** | **String**| Cursor for pagination | [optional]
 **limit** | **int**| Number of items to return (1-100) | [optional]

### Return type

[**AdminFlagQueueResponse**](AdminFlagQueueResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminFlagsResolve**
> AdminResolveResponse adminFlagsResolve(flagId, adminFlagResolveRequest)

Resolve a flagged content item

Marks a flag as resolved with a reason code.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String flagId = flagId_example; // String | Flag identifier
final AdminFlagResolveRequest adminFlagResolveRequest = ; // AdminFlagResolveRequest |

try {
    final response = api.adminFlagsResolve(flagId, adminFlagResolveRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminFlagsResolve: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **flagId** | **String**| Flag identifier |
 **adminFlagResolveRequest** | [**AdminFlagResolveRequest**](AdminFlagResolveRequest.md)|  |

### Return type

[**AdminResolveResponse**](AdminResolveResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminInvitesBatch**
> AdminInviteBatchResponse adminInvitesBatch(adminInviteBatchRequest)

Batch create invite codes

Creates multiple invite codes in a single request.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final AdminInviteBatchRequest adminInviteBatchRequest = ; // AdminInviteBatchRequest |

try {
    final response = api.adminInvitesBatch(adminInviteBatchRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminInvitesBatch: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **adminInviteBatchRequest** | [**AdminInviteBatchRequest**](AdminInviteBatchRequest.md)|  |

### Return type

[**AdminInviteBatchResponse**](AdminInviteBatchResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminInvitesCreate**
> AdminCreatedInvite adminInvitesCreate(adminInviteCreateRequest)

Create an invite code

Creates a single admin invite code.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final AdminInviteCreateRequest adminInviteCreateRequest = {"email":"alpha.user@example.com","expiresInDays":14,"maxUses":1,"label":"technical-alpha"}; // AdminInviteCreateRequest |

try {
    final response = api.adminInvitesCreate(adminInviteCreateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminInvitesCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **adminInviteCreateRequest** | [**AdminInviteCreateRequest**](AdminInviteCreateRequest.md)|  |

### Return type

[**AdminCreatedInvite**](AdminCreatedInvite.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminInvitesDelete**
> AdminInviteRevokeResponse adminInvitesDelete(inviteId)

Revoke an Alpha invite

Revokes the invite without deleting its audit record.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String inviteId = inviteId_example; // String | Opaque invite identifier

try {
    final response = api.adminInvitesDelete(inviteId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminInvitesDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **inviteId** | **String**| Opaque invite identifier |

### Return type

[**AdminInviteRevokeResponse**](AdminInviteRevokeResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminInvitesGet**
> AdminInviteResponse adminInvitesGet(inviteId)

Get an Alpha invite

Fetch a single invite by opaque administrative identifier.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String inviteId = inviteId_example; // String | Opaque invite identifier

try {
    final response = api.adminInvitesGet(inviteId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminInvitesGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **inviteId** | **String**| Opaque invite identifier |

### Return type

[**AdminInviteResponse**](AdminInviteResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminInvitesList**
> AdminInviteListResponse adminInvitesList(createdBy, unused, cursor, limit)

List Alpha invites

Returns opaque invite identifiers and usage metadata. Plaintext codes are never listed.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String createdBy = createdBy_example; // String | Filter by creator id
final bool unused = true; // bool | Filter for unused invites only
final String cursor = cursor_example; // String | Cursor for pagination
final int limit = 56; // int | Number of items to return (1-200)

try {
    final response = api.adminInvitesList(createdBy, unused, cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminInvitesList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **createdBy** | **String**| Filter by creator id | [optional]
 **unused** | **bool**| Filter for unused invites only | [optional]
 **cursor** | **String**| Cursor for pagination | [optional]
 **limit** | **int**| Number of items to return (1-200) | [optional]

### Return type

[**AdminInviteListResponse**](AdminInviteListResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminInvitesRevoke**
> AdminInviteRevokeResponse adminInvitesRevoke(inviteId, adminInviteRevokeRequest)

Revoke an invite code

Revokes an invite code immediately.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String inviteId = inviteId_example; // String | Opaque invite identifier
final AdminInviteRevokeRequest adminInviteRevokeRequest = ; // AdminInviteRevokeRequest |

try {
    final response = api.adminInvitesRevoke(inviteId, adminInviteRevokeRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminInvitesRevoke: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **inviteId** | **String**| Opaque invite identifier |
 **adminInviteRevokeRequest** | [**AdminInviteRevokeRequest**](AdminInviteRevokeRequest.md)|  | [optional]

### Return type

[**AdminInviteRevokeResponse**](AdminInviteRevokeResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminModerationClassReset**
> JsonObject adminModerationClassReset(className, body)

Reset a moderation class to defaults

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String className = className_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminModerationClassReset(className, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminModerationClassReset: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **className** | **String**|  |
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminModerationClassesList**
> JsonObject adminModerationClassesList()

List moderation label classes

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminModerationClassesList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminModerationClassesList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminModerationWeightsUpdate**
> JsonObject adminModerationWeightsUpdate(body)

Bulk-update moderation class weights

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminModerationWeightsUpdate(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminModerationWeightsUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminNewsIngest**
> JsonObject adminNewsIngest(body)

Ingest news items into the news board

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminNewsIngest(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminNewsIngest: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminOpsMetrics**
> JsonObject adminOpsMetrics()

Get operational metrics

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminOpsMetrics();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminOpsMetrics: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminOpsStateGet**
> JsonObject adminOpsStateGet()

Get operational state flags

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminOpsStateGet();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminOpsStateGet: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminOpsStateUpdate**
> JsonObject adminOpsStateUpdate(body)

Update operational state flags

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.adminOpsStateUpdate(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminOpsStateUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminSetUserTier**
> AdminUserActionResponse adminSetUserTier(userId, adminSetUserTierRequest)

Set user subscription tier

Update the subscription tier of a specific user. Requires active admin privileges.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String userId = userId_example; // String | User identifier
final AdminSetUserTierRequest adminSetUserTierRequest = ; // AdminSetUserTierRequest |

try {
    final response = api.adminSetUserTier(userId, adminSetUserTierRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminSetUserTier: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **userId** | **String**| User identifier |
 **adminSetUserTierRequest** | [**AdminSetUserTierRequest**](AdminSetUserTierRequest.md)|  |

### Return type

[**AdminUserActionResponse**](AdminUserActionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminTestDataPurge**
> AdminTestDataPurge200Response adminTestDataPurge(adminTestDataPurgeRequest)

Purge test data outside production

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final AdminTestDataPurgeRequest adminTestDataPurgeRequest = ; // AdminTestDataPurgeRequest |

try {
    final response = api.adminTestDataPurge(adminTestDataPurgeRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminTestDataPurge: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **adminTestDataPurgeRequest** | [**AdminTestDataPurgeRequest**](AdminTestDataPurgeRequest.md)|  |

### Return type

[**AdminTestDataPurge200Response**](AdminTestDataPurge200Response.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUsersDisable**
> AdminUserActionResponse adminUsersDisable(userId, adminUserDisableRequest)

Disable a user

Disables a user account immediately.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String userId = userId_example; // String | User identifier
final AdminUserDisableRequest adminUserDisableRequest = ; // AdminUserDisableRequest |

try {
    final response = api.adminUsersDisable(userId, adminUserDisableRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUsersDisable: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **userId** | **String**| User identifier |
 **adminUserDisableRequest** | [**AdminUserDisableRequest**](AdminUserDisableRequest.md)|  |

### Return type

[**AdminUserActionResponse**](AdminUserActionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUsersEnable**
> AdminUserActionResponse adminUsersEnable(userId, adminUserEnableRequest)

Enable a user

Re-enables a previously disabled user.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String userId = userId_example; // String | User identifier
final AdminUserEnableRequest adminUserEnableRequest = ; // AdminUserEnableRequest |

try {
    final response = api.adminUsersEnable(userId, adminUserEnableRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUsersEnable: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **userId** | **String**| User identifier |
 **adminUserEnableRequest** | [**AdminUserEnableRequest**](AdminUserEnableRequest.md)|  | [optional]

### Return type

[**AdminUserActionResponse**](AdminUserActionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUsersSearch**
> AdminUserSearchResponse adminUsersSearch(q, limit)

Search users

Search by user id, handle, display name, or email.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAdminApi();
final String q = q_example; // String | Search query
final int limit = 56; // int | Number of items to return (1-100)

try {
    final response = api.adminUsersSearch(q, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUsersSearch: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **q** | **String**| Search query |
 **limit** | **int**| Number of items to return (1-100) | [optional]

### Return type

[**AdminUserSearchResponse**](AdminUserSearchResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
