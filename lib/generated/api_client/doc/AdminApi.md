# lythaus_api_client.api.AdminApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**adminAppealsAdjudicate**](AdminApi.md#adminappealsadjudicate) | **POST** /admin/appeals/{appealId}/adjudications | Record a trained editorial appeal adjudication
[**adminAppealsPendingAdjudicationList**](AdminApi.md#adminappealspendingadjudicationlist) | **GET** /admin/appeals/pending-adjudication | List pending appeal adjudications
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
[**adminEditorialPublicationsCreate**](AdminApi.md#admineditorialpublicationscreate) | **POST** /admin/editorial/publications | Publish an editorial News Board entry
[**adminFlagsGet**](AdminApi.md#adminflagsget) | **GET** /_admin/flags/{flagId} | Get a flagged content detail
[**adminFlagsList**](AdminApi.md#adminflagslist) | **GET** /_admin/flags | List flagged content queue
[**adminFlagsResolve**](AdminApi.md#adminflagsresolve) | **POST** /_admin/flags/{flagId}/resolve | Resolve a flagged content item
[**adminHealth**](AdminApi.md#adminhealth) | **GET** /admin/health | Check admin Worker health
[**adminInvitesBatch**](AdminApi.md#admininvitesbatch) | **POST** /_admin/invites/batch | Batch create invite codes
[**adminInvitesCreate**](AdminApi.md#admininvitescreate) | **POST** /_admin/invites | Create an invite code
[**adminInvitesDelete**](AdminApi.md#admininvitesdelete) | **DELETE** /_admin/invites/{inviteId} | Revoke an Alpha invite
[**adminInvitesGet**](AdminApi.md#admininvitesget) | **GET** /_admin/invites/{inviteId} | Get an Alpha invite
[**adminInvitesList**](AdminApi.md#admininviteslist) | **GET** /_admin/invites | List Alpha invites
[**adminInvitesRevoke**](AdminApi.md#admininvitesrevoke) | **POST** /_admin/invites/{inviteId}/revoke | Revoke an invite code
[**adminLegalHoldsClear**](AdminApi.md#adminlegalholdsclear) | **POST** /admin/privacy/legal-holds/{holdId}/clear | Clear a legal hold
[**adminLegalHoldsCreate**](AdminApi.md#adminlegalholdscreate) | **POST** /admin/privacy/legal-holds | Place a legal hold
[**adminLegalHoldsList**](AdminApi.md#adminlegalholdslist) | **GET** /admin/privacy/legal-holds | List active and released legal holds
[**adminModerationCasesList**](AdminApi.md#adminmoderationcaseslist) | **GET** /admin/moderation/cases | List moderation cases
[**adminModerationClassReset**](AdminApi.md#adminmoderationclassreset) | **POST** /admin/moderation-classes/{className}/reset | Reset a moderation class to defaults
[**adminModerationClassesList**](AdminApi.md#adminmoderationclasseslist) | **GET** /admin/moderation-classes | List moderation label classes
[**adminModerationDecision**](AdminApi.md#adminmoderationdecision) | **POST** /admin/moderation/cases/{caseId}/decision | Apply a moderation decision
[**adminModerationWeightsUpdate**](AdminApi.md#adminmoderationweightsupdate) | **POST** /admin/moderation-classes/weights | Bulk-update moderation class weights
[**adminNewsIngest**](AdminApi.md#adminnewsingest) | **POST** /_admin/news/ingest | Ingest news items into the news board
[**adminOpsMetrics**](AdminApi.md#adminopsmetrics) | **GET** /_admin/ops/metrics | Get operational metrics
[**adminOpsStateGet**](AdminApi.md#adminopsstateget) | **GET** /_admin/ops/state | Get operational state flags
[**adminOpsStateUpdate**](AdminApi.md#adminopsstateupdate) | **PUT** /_admin/ops/state | Update operational state flags
[**adminPrivacyRequestsList**](AdminApi.md#adminprivacyrequestslist) | **GET** /admin/privacy/requests | List privacy requests
[**adminReviewerQualificationCreate**](AdminApi.md#adminreviewerqualificationcreate) | **POST** /admin/reviewers/{reviewerId}/qualification | Set reviewer qualification state
[**adminReviewerQualificationUpdate**](AdminApi.md#adminreviewerqualificationupdate) | **PUT** /admin/reviewers/{reviewerId}/qualification | Idempotently set reviewer qualification state
[**adminTestDataPurge**](AdminApi.md#admintestdatapurge) | **POST** /admin/test-data/purge | Purge test data outside production
[**adminUsersDisable**](AdminApi.md#adminusersdisable) | **POST** /_admin/users/{userId}/disable | Disable a user
[**adminUsersEnable**](AdminApi.md#adminusersenable) | **POST** /_admin/users/{userId}/enable | Enable a user
[**adminUsersSearch**](AdminApi.md#adminuserssearch) | **GET** /_admin/users/search | Search users
[**adminUsersStatusUpdate**](AdminApi.md#adminusersstatusupdate) | **POST** /admin/users/{userId}/status | Update account status
[**adminUsersTierUpdate**](AdminApi.md#adminuserstierupdate) | **POST** /admin/users/{userId}/tier | Update subscription tier
[**productIntegrityAdminAuditList**](AdminApi.md#productintegrityadminauditlist) | **GET** /admin/audit | List admin audit events
[**productIntegrityAdminUsersSearch**](AdminApi.md#productintegrityadminuserssearch) | **GET** /admin/users/search | Search users


# **adminAppealsAdjudicate**
> AppealAdjudicationResponse adminAppealsAdjudicate(appealId, appealAdjudicationRequest)

Record a trained editorial appeal adjudication

This never auto-resolves an appeal. The shared governance policy evaluates the independently assigned reviewer quorum and then requires one trained adjudicator for standard risk or two for high risk. The outcome is applied only when the returned status is resolved.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String appealId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AppealAdjudicationRequest appealAdjudicationRequest = ; // AppealAdjudicationRequest |

try {
    final response = api.adminAppealsAdjudicate(appealId, appealAdjudicationRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAppealsAdjudicate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **appealId** | **String**|  |
 **appealAdjudicationRequest** | [**AppealAdjudicationRequest**](AppealAdjudicationRequest.md)|  |

### Return type

[**AppealAdjudicationResponse**](AppealAdjudicationResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminAppealsPendingAdjudicationList**
> PendingAppealAdjudicationList adminAppealsPendingAdjudicationList()

List pending appeal adjudications

Editorial, administrator, and owner roles may list independent appeals awaiting adjudication. Only trained editorial adjudicators may record an adjudication.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminAppealsPendingAdjudicationList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminAppealsPendingAdjudicationList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**PendingAppealAdjudicationList**](PendingAppealAdjudicationList.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
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

# **adminEditorialPublicationsCreate**
> EditorialPublicationResponse adminEditorialPublicationsCreate(editorialPublicationCreate)

Publish an editorial News Board entry

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final EditorialPublicationCreate editorialPublicationCreate = ; // EditorialPublicationCreate |

try {
    final response = api.adminEditorialPublicationsCreate(editorialPublicationCreate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminEditorialPublicationsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **editorialPublicationCreate** | [**EditorialPublicationCreate**](EditorialPublicationCreate.md)|  |

### Return type

[**EditorialPublicationResponse**](EditorialPublicationResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

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

# **adminHealth**
> AdminHealth adminHealth()

Check admin Worker health

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminHealth();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminHealth: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AdminHealth**](AdminHealth.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
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

# **adminLegalHoldsClear**
> LegalHoldResponse adminLegalHoldsClear(holdId)

Clear a legal hold

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String holdId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.adminLegalHoldsClear(holdId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminLegalHoldsClear: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **holdId** | **String**|  |

### Return type

[**LegalHoldResponse**](LegalHoldResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminLegalHoldsCreate**
> LegalHoldResponse adminLegalHoldsCreate(legalHoldCreate)

Place a legal hold

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final LegalHoldCreate legalHoldCreate = ; // LegalHoldCreate |

try {
    final response = api.adminLegalHoldsCreate(legalHoldCreate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminLegalHoldsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **legalHoldCreate** | [**LegalHoldCreate**](LegalHoldCreate.md)|  |

### Return type

[**LegalHoldResponse**](LegalHoldResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminLegalHoldsList**
> AdminItems adminLegalHoldsList()

List active and released legal holds

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminLegalHoldsList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminLegalHoldsList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AdminItems**](AdminItems.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminModerationCasesList**
> AdminItems adminModerationCasesList()

List moderation cases

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminModerationCasesList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminModerationCasesList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AdminItems**](AdminItems.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
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

# **adminModerationDecision**
> ModerationDecisionResponse adminModerationDecision(caseId, moderationDecisionRequest)

Apply a moderation decision

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ModerationDecisionRequest moderationDecisionRequest = ; // ModerationDecisionRequest |

try {
    final response = api.adminModerationDecision(caseId, moderationDecisionRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminModerationDecision: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **moderationDecisionRequest** | [**ModerationDecisionRequest**](ModerationDecisionRequest.md)|  |

### Return type

[**ModerationDecisionResponse**](ModerationDecisionResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
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

# **adminPrivacyRequestsList**
> AdminItems adminPrivacyRequestsList()

List privacy requests

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.adminPrivacyRequestsList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminPrivacyRequestsList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AdminItems**](AdminItems.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminReviewerQualificationCreate**
> ReviewerQualificationResponse adminReviewerQualificationCreate(reviewerId, reviewerQualificationUpdateRequest)

Set reviewer qualification state

Compatibility method for the idempotent qualification update. Reviewer training remains separate from reputation level.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String reviewerId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ReviewerQualificationUpdateRequest reviewerQualificationUpdateRequest = ; // ReviewerQualificationUpdateRequest |

try {
    final response = api.adminReviewerQualificationCreate(reviewerId, reviewerQualificationUpdateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminReviewerQualificationCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **reviewerId** | **String**|  |
 **reviewerQualificationUpdateRequest** | [**ReviewerQualificationUpdateRequest**](ReviewerQualificationUpdateRequest.md)|  |

### Return type

[**ReviewerQualificationResponse**](ReviewerQualificationResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminReviewerQualificationUpdate**
> ReviewerQualificationResponse adminReviewerQualificationUpdate(reviewerId, reviewerQualificationUpdateRequest)

Idempotently set reviewer qualification state

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String reviewerId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ReviewerQualificationUpdateRequest reviewerQualificationUpdateRequest = ; // ReviewerQualificationUpdateRequest |

try {
    final response = api.adminReviewerQualificationUpdate(reviewerId, reviewerQualificationUpdateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminReviewerQualificationUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **reviewerId** | **String**|  |
 **reviewerQualificationUpdateRequest** | [**ReviewerQualificationUpdateRequest**](ReviewerQualificationUpdateRequest.md)|  |

### Return type

[**ReviewerQualificationResponse**](ReviewerQualificationResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

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

# **adminUsersStatusUpdate**
> AccountStatusResponse adminUsersStatusUpdate(userId, accountStatusUpdate)

Update account status

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String userId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AccountStatusUpdate accountStatusUpdate = ; // AccountStatusUpdate |

try {
    final response = api.adminUsersStatusUpdate(userId, accountStatusUpdate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUsersStatusUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **userId** | **String**|  |
 **accountStatusUpdate** | [**AccountStatusUpdate**](AccountStatusUpdate.md)|  |

### Return type

[**AccountStatusResponse**](AccountStatusResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **adminUsersTierUpdate**
> AccountTierResponse adminUsersTierUpdate(userId, accountTierUpdate)

Update subscription tier

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String userId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AccountTierUpdate accountTierUpdate = ; // AccountTierUpdate |

try {
    final response = api.adminUsersTierUpdate(userId, accountTierUpdate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->adminUsersTierUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **userId** | **String**|  |
 **accountTierUpdate** | [**AccountTierUpdate**](AccountTierUpdate.md)|  |

### Return type

[**AccountTierResponse**](AccountTierResponse.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **productIntegrityAdminAuditList**
> AdminItems productIntegrityAdminAuditList()

List admin audit events

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();

try {
    final response = api.productIntegrityAdminAuditList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->productIntegrityAdminAuditList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AdminItems**](AdminItems.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **productIntegrityAdminUsersSearch**
> AdminItems productIntegrityAdminUsersSearch(q)

Search users

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: cloudflareAccess
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('cloudflareAccess').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAdminApi();
final String q = q_example; // String |

try {
    final response = api.productIntegrityAdminUsersSearch(q);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AdminApi->productIntegrityAdminUsersSearch: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **q** | **String**|  |

### Return type

[**AdminItems**](AdminItems.md)

### Authorization

[cloudflareAccess](../README.md#cloudflareAccess)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
