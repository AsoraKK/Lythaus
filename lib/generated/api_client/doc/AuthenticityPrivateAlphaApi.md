# lythaus_api_client.api.AuthenticityPrivateAlphaApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**cancelAuthenticityPrivateAlphaCase**](AuthenticityPrivateAlphaApi.md#cancelauthenticityprivatealphacase) | **POST** /authenticity/alpha/cases/{caseId}/cancel | Cancel private alpha processing
[**createAuthenticityPrivateAlphaCase**](AuthenticityPrivateAlphaApi.md#createauthenticityprivatealphacase) | **POST** /authenticity/alpha/cases | Create a text, image or mixed private alpha case
[**deleteAuthenticityPrivateAlphaCase**](AuthenticityPrivateAlphaApi.md#deleteauthenticityprivatealphacase) | **DELETE** /authenticity/alpha/cases/{caseId} | Delete a private alpha case
[**finaliseAuthenticityPrivateAlphaCase**](AuthenticityPrivateAlphaApi.md#finaliseauthenticityprivatealphacase) | **POST** /authenticity/alpha/cases/{caseId}/finalise | Finalize a private alpha image upload
[**getAuthenticityPrivateAlphaCase**](AuthenticityPrivateAlphaApi.md#getauthenticityprivatealphacase) | **GET** /authenticity/alpha/cases/{caseId} | Get a private alpha result
[**getAuthenticityPrivateAlphaImage**](AuthenticityPrivateAlphaApi.md#getauthenticityprivatealphaimage) | **GET** /authenticity/alpha/cases/{caseId}/image | Get a private alpha image
[**listAuthenticityPrivateAlphaCases**](AuthenticityPrivateAlphaApi.md#listauthenticityprivatealphacases) | **GET** /authenticity/alpha/cases | List private alpha cases
[**requestAuthenticityPrivateAlphaAdvice**](AuthenticityPrivateAlphaApi.md#requestauthenticityprivatealphaadvice) | **POST** /authenticity/alpha/cases/{caseId}/advice | Request one bounded GPT-OSS explanation
[**requestAuthenticityPrivateAlphaReview**](AuthenticityPrivateAlphaApi.md#requestauthenticityprivatealphareview) | **POST** /authenticity/alpha/cases/{caseId}/review | Request private alpha review
[**submitAuthenticityPrivateAlphaFeedback**](AuthenticityPrivateAlphaApi.md#submitauthenticityprivatealphafeedback) | **POST** /authenticity/alpha/cases/{caseId}/feedback | Submit private alpha feedback


# **cancelAuthenticityPrivateAlphaCase**
> AlphaAction cancelAuthenticityPrivateAlphaCase(caseId)

Cancel private alpha processing

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityPrivateAlphaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.cancelAuthenticityPrivateAlphaCase(caseId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityPrivateAlphaApi->cancelAuthenticityPrivateAlphaCase: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |

### Return type

[**AlphaAction**](AlphaAction.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **createAuthenticityPrivateAlphaCase**
> AlphaCreateResponse createAuthenticityPrivateAlphaCase(alphaCreateRequest)

Create a text, image or mixed private alpha case

Author/admin-only, non-enforcing alpha. Image bytes remain in quarantine until finalisation. Polling does not start work.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityPrivateAlphaApi();
final AlphaCreateRequest alphaCreateRequest = ; // AlphaCreateRequest |

try {
    final response = api.createAuthenticityPrivateAlphaCase(alphaCreateRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityPrivateAlphaApi->createAuthenticityPrivateAlphaCase: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **alphaCreateRequest** | [**AlphaCreateRequest**](AlphaCreateRequest.md)|  |

### Return type

[**AlphaCreateResponse**](AlphaCreateResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteAuthenticityPrivateAlphaCase**
> AlphaAction deleteAuthenticityPrivateAlphaCase(caseId)

Delete a private alpha case

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityPrivateAlphaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.deleteAuthenticityPrivateAlphaCase(caseId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityPrivateAlphaApi->deleteAuthenticityPrivateAlphaCase: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |

### Return type

[**AlphaAction**](AlphaAction.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **finaliseAuthenticityPrivateAlphaCase**
> AlphaAction finaliseAuthenticityPrivateAlphaCase(caseId)

Finalize a private alpha image upload

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityPrivateAlphaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.finaliseAuthenticityPrivateAlphaCase(caseId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityPrivateAlphaApi->finaliseAuthenticityPrivateAlphaCase: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |

### Return type

[**AlphaAction**](AlphaAction.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getAuthenticityPrivateAlphaCase**
> AlphaCase getAuthenticityPrivateAlphaCase(caseId)

Get a private alpha result

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityPrivateAlphaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.getAuthenticityPrivateAlphaCase(caseId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityPrivateAlphaApi->getAuthenticityPrivateAlphaCase: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |

### Return type

[**AlphaCase**](AlphaCase.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getAuthenticityPrivateAlphaImage**
> getAuthenticityPrivateAlphaImage(caseId)

Get a private alpha image

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityPrivateAlphaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    api.getAuthenticityPrivateAlphaImage(caseId);
} catch on DioException (e) {
    print('Exception when calling AuthenticityPrivateAlphaApi->getAuthenticityPrivateAlphaImage: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |

### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: image/png, image/jpeg, application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listAuthenticityPrivateAlphaCases**
> AlphaCaseList listAuthenticityPrivateAlphaCases()

List private alpha cases

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityPrivateAlphaApi();

try {
    final response = api.listAuthenticityPrivateAlphaCases();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityPrivateAlphaApi->listAuthenticityPrivateAlphaCases: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AlphaCaseList**](AlphaCaseList.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **requestAuthenticityPrivateAlphaAdvice**
> AlphaAction requestAuthenticityPrivateAlphaAdvice(caseId)

Request one bounded GPT-OSS explanation

Uses persisted evidence only. It cannot rerun SAFE, certify authorship, or change publication/reputation state.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityPrivateAlphaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.requestAuthenticityPrivateAlphaAdvice(caseId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityPrivateAlphaApi->requestAuthenticityPrivateAlphaAdvice: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |

### Return type

[**AlphaAction**](AlphaAction.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **requestAuthenticityPrivateAlphaReview**
> AlphaAction requestAuthenticityPrivateAlphaReview(caseId, alphaFeedback)

Request private alpha review

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityPrivateAlphaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AlphaFeedback alphaFeedback = ; // AlphaFeedback |

try {
    final response = api.requestAuthenticityPrivateAlphaReview(caseId, alphaFeedback);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityPrivateAlphaApi->requestAuthenticityPrivateAlphaReview: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **alphaFeedback** | [**AlphaFeedback**](AlphaFeedback.md)|  |

### Return type

[**AlphaAction**](AlphaAction.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **submitAuthenticityPrivateAlphaFeedback**
> AlphaAction submitAuthenticityPrivateAlphaFeedback(caseId, alphaFeedback)

Submit private alpha feedback

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthenticityPrivateAlphaApi();
final String caseId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final AlphaFeedback alphaFeedback = ; // AlphaFeedback |

try {
    final response = api.submitAuthenticityPrivateAlphaFeedback(caseId, alphaFeedback);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthenticityPrivateAlphaApi->submitAuthenticityPrivateAlphaFeedback: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **caseId** | **String**|  |
 **alphaFeedback** | [**AlphaFeedback**](AlphaFeedback.md)|  |

### Return type

[**AlphaAction**](AlphaAction.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
