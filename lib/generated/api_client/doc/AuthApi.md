# lythaus_api_client.api.AuthApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**authEmail**](AuthApi.md#authemail) | **POST** /auth/email | Register, sign in, or resend email verification
[**authEmailVerifyPost**](AuthApi.md#authemailverifypost) | **POST** /auth/email/verify | Verify an email address with a JSON token
[**authJwksGet**](AuthApi.md#authjwksget) | **GET** /.well-known/jwks.json | Get the public JWT verification key set
[**authLogout**](AuthApi.md#authlogout) | **POST** /auth/logout | Revoke all active sessions for the authenticated user
[**authPasswordResetComplete**](AuthApi.md#authpasswordresetcomplete) | **POST** /auth/password/reset/complete | Complete password reset and revoke existing sessions
[**authPasswordResetRequest**](AuthApi.md#authpasswordresetrequest) | **POST** /auth/password/reset/request | Request an opaque password reset message
[**authRefresh**](AuthApi.md#authrefresh) | **POST** /auth/refresh | Rotate a refresh token
[**authUserInfo**](AuthApi.md#authuserinfo) | **GET** /auth/userinfo | Get the authenticated user&#39;s current identity claims


# **authEmail**
> EmailSessionResponse authEmail(emailAuthRequest)

Register, sign in, or resend email verification

Registers an email account, signs in a verified account, or resends a verification message. Registration requires a Turnstile token when the production bot-protection gate is enabled.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final EmailAuthRequest emailAuthRequest = {"mode":"login","email":"alice@example.com","password":"correct-horse-battery-staple"}; // EmailAuthRequest |

try {
    final response = api.authEmail(emailAuthRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authEmail: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **emailAuthRequest** | [**EmailAuthRequest**](EmailAuthRequest.md)|  |

### Return type

[**EmailSessionResponse**](EmailSessionResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authEmailVerifyPost**
> EmailVerificationResponse authEmailVerifyPost(emailVerificationRequest)

Verify an email address with a JSON token

Consumes a single-use email-verification token and returns only a private verification state.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final EmailVerificationRequest emailVerificationRequest = ; // EmailVerificationRequest |

try {
    final response = api.authEmailVerifyPost(emailVerificationRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authEmailVerifyPost: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **emailVerificationRequest** | [**EmailVerificationRequest**](EmailVerificationRequest.md)|  |

### Return type

[**EmailVerificationResponse**](EmailVerificationResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authJwksGet**
> AuthJwksGet200Response authJwksGet()

Get the public JWT verification key set

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();

try {
    final response = api.authJwksGet();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authJwksGet: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AuthJwksGet200Response**](AuthJwksGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authLogout**
> AuthLogout200Response authLogout()

Revoke all active sessions for the authenticated user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();

try {
    final response = api.authLogout();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authLogout: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AuthLogout200Response**](AuthLogout200Response.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authPasswordResetComplete**
> AuthPasswordResetComplete200Response authPasswordResetComplete(authPasswordResetCompleteRequest)

Complete password reset and revoke existing sessions

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final AuthPasswordResetCompleteRequest authPasswordResetCompleteRequest = ; // AuthPasswordResetCompleteRequest |

try {
    final response = api.authPasswordResetComplete(authPasswordResetCompleteRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authPasswordResetComplete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authPasswordResetCompleteRequest** | [**AuthPasswordResetCompleteRequest**](AuthPasswordResetCompleteRequest.md)|  |

### Return type

[**AuthPasswordResetComplete200Response**](AuthPasswordResetComplete200Response.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authPasswordResetRequest**
> AuthPasswordResetRequest202Response authPasswordResetRequest(authPasswordResetRequestRequest)

Request an opaque password reset message

Always returns the same neutral state so account existence is not disclosed.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final AuthPasswordResetRequestRequest authPasswordResetRequestRequest = {"email":"member@example.com","turnstileToken":"turnstile-token"}; // AuthPasswordResetRequestRequest |

try {
    final response = api.authPasswordResetRequest(authPasswordResetRequestRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authPasswordResetRequest: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authPasswordResetRequestRequest** | [**AuthPasswordResetRequestRequest**](AuthPasswordResetRequestRequest.md)|  |

### Return type

[**AuthPasswordResetRequest202Response**](AuthPasswordResetRequest202Response.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authRefresh**
> EmailSessionResponse authRefresh(refreshSessionRequest)

Rotate a refresh token

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final RefreshSessionRequest refreshSessionRequest = {"refreshToken":"refresh_example_01K1LYTHAUS"}; // RefreshSessionRequest |

try {
    final response = api.authRefresh(refreshSessionRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authRefresh: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **refreshSessionRequest** | [**RefreshSessionRequest**](RefreshSessionRequest.md)|  |

### Return type

[**EmailSessionResponse**](EmailSessionResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authUserInfo**
> AuthUserInfo200Response authUserInfo()

Get the authenticated user's current identity claims

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();

try {
    final response = api.authUserInfo();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authUserInfo: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**AuthUserInfo200Response**](AuthUserInfo200Response.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
