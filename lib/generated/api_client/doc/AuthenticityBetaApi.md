# lythaus_api_client.api.AuthenticityBetaApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**authenticityBetaCancel**](AuthenticityBetaApi.md#authenticitybetacancel) | **POST** /authenticity/cases/{caseId}/cancel | Cancel unfinished analysis
[**authenticityBetaFeedback**](AuthenticityBetaApi.md#authenticitybetafeedback) | **POST** /authenticity/cases/{caseId}/feedback | Submit private feedback
[**authenticityBetaFinalise**](AuthenticityBetaApi.md#authenticitybetafinalise) | **POST** /authenticity/cases/{caseId}/finalise | Finish the immutable upload
[**authenticityBetaReview**](AuthenticityBetaApi.md#authenticitybetareview) | **POST** /authenticity/cases/{caseId}/review | Request review or appeal a review
[**createAuthenticityBetaCase**](AuthenticityBetaApi.md#createauthenticitybetacase) | **POST** /authenticity/cases | Create an upload case
[**deleteAuthenticityBetaCase**](AuthenticityBetaApi.md#deleteauthenticitybetacase) | **DELETE** /authenticity/cases/{caseId} | Invalidate and delete your case
[**getAuthenticityBetaCase**](AuthenticityBetaApi.md#getauthenticitybetacase) | **GET** /authenticity/cases/{caseId} | Read a private case
[**getAuthenticityBetaImage**](AuthenticityBetaApi.md#getauthenticitybetaimage) | **GET** /authenticity/cases/{caseId}/image | Read the private display derivative
[**listAuthenticityBetaCases**](AuthenticityBetaApi.md#listauthenticitybetacases) | **GET** /authenticity/cases | List your private beta cases


# **authenticityBetaCancel**
> BetaActionResponse authenticityBetaCancel(caseId, idempotencyKey)

Cancel unfinished analysis

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityBetaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |

try {
    final response = api.authenticityBetaCancel(caseId, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityBetaApi->authenticityBetaCancel: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **idempotencyKey** | **String**|  |

### Return type

[**BetaActionResponse**](BetaActionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authenticityBetaFeedback**
> BetaActionResponse authenticityBetaFeedback(caseId, idempotencyKey, betaFeedback)

Submit private feedback

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityBetaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |
final BetaFeedback betaFeedback = ; // BetaFeedback |

try {
    final response = api.authenticityBetaFeedback(caseId, idempotencyKey, betaFeedback);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityBetaApi->authenticityBetaFeedback: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **idempotencyKey** | **String**|  |
 **betaFeedback** | [**BetaFeedback**](BetaFeedback.md)|  |

### Return type

[**BetaActionResponse**](BetaActionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authenticityBetaFinalise**
> BetaActionResponse authenticityBetaFinalise(caseId, idempotencyKey)

Finish the immutable upload

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityBetaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |

try {
    final response = api.authenticityBetaFinalise(caseId, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityBetaApi->authenticityBetaFinalise: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **idempotencyKey** | **String**|  |

### Return type

[**BetaActionResponse**](BetaActionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authenticityBetaReview**
> BetaActionResponse authenticityBetaReview(caseId, idempotencyKey, betaFeedback)

Request review or appeal a review

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityBetaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |
final BetaFeedback betaFeedback = ; // BetaFeedback |

try {
    final response = api.authenticityBetaReview(caseId, idempotencyKey, betaFeedback);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityBetaApi->authenticityBetaReview: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **idempotencyKey** | **String**|  |
 **betaFeedback** | [**BetaFeedback**](BetaFeedback.md)|  |

### Return type

[**BetaActionResponse**](BetaActionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **createAuthenticityBetaCase**
> BetaUpload createAuthenticityBetaCase(idempotencyKey, betaSubmission)

Create an upload case

Private original-byte upload; at most 10 MiB and 16,777,216 decoded pixels, one RGB PNG/JPEG frame, at least 256 pixels per side. Oversized inputs are rejected without resizing. Source history determines interpretation separately from successful inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityBetaApi();
final String idempotencyKey = idempotencyKey_example; // String |
final BetaSubmission betaSubmission = ; // BetaSubmission |

try {
    final response = api.createAuthenticityBetaCase(idempotencyKey, betaSubmission);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityBetaApi->createAuthenticityBetaCase: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **idempotencyKey** | **String**|  |
 **betaSubmission** | [**BetaSubmission**](BetaSubmission.md)|  |

### Return type

[**BetaUpload**](BetaUpload.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteAuthenticityBetaCase**
> BetaActionResponse deleteAuthenticityBetaCase(caseId, idempotencyKey)

Invalidate and delete your case

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityBetaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String |

try {
    final response = api.deleteAuthenticityBetaCase(caseId, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityBetaApi->deleteAuthenticityBetaCase: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **idempotencyKey** | **String**|  |

### Return type

[**BetaActionResponse**](BetaActionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getAuthenticityBetaCase**
> BetaCase getAuthenticityBetaCase(caseId)

Read a private case

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityBetaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.getAuthenticityBetaCase(caseId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityBetaApi->getAuthenticityBetaCase: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |

### Return type

[**BetaCase**](BetaCase.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getAuthenticityBetaImage**
> Uint8List getAuthenticityBetaImage(caseId)

Read the private display derivative

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityBetaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.getAuthenticityBetaImage(caseId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityBetaApi->getAuthenticityBetaImage: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |

### Return type

[**Uint8List**](Uint8List.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: image/png, application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listAuthenticityBetaCases**
> BetaCaseList listAuthenticityBetaCases()

List your private beta cases

Private, non-enforcing beta. Responses are no-store. Polling never starts inference.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityBetaApi();

try {
    final response = api.listAuthenticityBetaCases();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityBetaApi->listAuthenticityBetaCases: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**BetaCaseList**](BetaCaseList.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
