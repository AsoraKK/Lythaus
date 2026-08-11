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
[**adminEditorialPublicationsCreate**](AdminApi.md#admineditorialpublicationscreate) | **POST** /admin/editorial/publications | Publish an editorial News Board entry
[**adminHealth**](AdminApi.md#adminhealth) | **GET** /admin/health | Check admin Worker health
[**adminLegalHoldsClear**](AdminApi.md#adminlegalholdsclear) | **POST** /admin/privacy/legal-holds/{holdId}/clear | Clear a legal hold
[**adminLegalHoldsCreate**](AdminApi.md#adminlegalholdscreate) | **POST** /admin/privacy/legal-holds | Place a legal hold
[**adminLegalHoldsList**](AdminApi.md#adminlegalholdslist) | **GET** /admin/privacy/legal-holds | List active and released legal holds
[**adminModerationCasesList**](AdminApi.md#adminmoderationcaseslist) | **GET** /admin/moderation/cases | List moderation cases
[**adminModerationDecision**](AdminApi.md#adminmoderationdecision) | **POST** /admin/moderation/cases/{caseId}/decision | Apply a moderation decision
[**adminPrivacyRequestsList**](AdminApi.md#adminprivacyrequestslist) | **GET** /admin/privacy/requests | List privacy requests
[**adminReviewerQualificationCreate**](AdminApi.md#adminreviewerqualificationcreate) | **POST** /admin/reviewers/{reviewerId}/qualification | Set reviewer qualification state
[**adminReviewerQualificationUpdate**](AdminApi.md#adminreviewerqualificationupdate) | **PUT** /admin/reviewers/{reviewerId}/qualification | Idempotently set reviewer qualification state
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
final AppealAdjudicationRequest appealAdjudicationRequest = {"decision":"uphold","reasonCode":"APPEAL.PANEL_CONFIRMED"}; // AppealAdjudicationRequest |

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
