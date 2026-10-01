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
> EmailSessionResponse authEmail(emailAuthRequest, xLythausAuthTransport, idempotencyKey)

Register, sign in, or resend email verification

Registers an email account, signs in a verified account, or resends a verification message. Registration requires a Turnstile token when the production bot-protection gate is enabled.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final EmailAuthRequest emailAuthRequest = {"mode":"login","email":"alice@example.com","password":"correct-horse-battery-staple"}; // EmailAuthRequest |
final String xLythausAuthTransport = xLythausAuthTransport_example; // String | Browser clients send cookie-v1 with credentials included and an exact allowed Origin. Refresh credentials use an HttpOnly Secure SameSite=Strict host-only cookie; native and older clients retain the JSON token transport. Never persist browser refresh or access credentials in Web Storage.
final String idempotencyKey = idempotencyKey_example; // String | Random per-operation key for registration or resend. Replaying the same accepted payload does not reuse Turnstile or mint another challenge. Ambiguous outcomes return 409; login responses are never cached.

try {
    final response = api.authEmail(emailAuthRequest, xLythausAuthTransport, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authEmail: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **emailAuthRequest** | [**EmailAuthRequest**](EmailAuthRequest.md)|  |
 **xLythausAuthTransport** | **String**| Browser clients send cookie-v1 with credentials included and an exact allowed Origin. Refresh credentials use an HttpOnly Secure SameSite=Strict host-only cookie; native and older clients retain the JSON token transport. Never persist browser refresh or access credentials in Web Storage. | [optional]
 **idempotencyKey** | **String**| Random per-operation key for registration or resend. Replaying the same accepted payload does not reuse Turnstile or mint another challenge. Ambiguous outcomes return 409; login responses are never cached. | [optional]

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

An intentional POST atomically consumes mailbox proof and establishes the mailbox owner's chosen credential on the existing user ID. GET/HEAD never mutates. Password policy is checked before token consumption; omitted password returns password_setup_required without consuming the link. No automatic session or bearer redirect is issued.

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
> AuthLogout200Response authLogout(xLythausAuthTransport, authLogoutRequest)

Revoke all active sessions for the authenticated user

Native clients may send their refresh credential to revoke sessions even after access-token expiry; bearer-only logout remains supported for deployed clients. Browser clients send cookie-v1 with credentials included, an exact allowed Origin and an empty JSON object. This globally revokes the account's sessions, not only this device, and expires the refresh cookie. Local sign-out or HTTP 401 alone does not prove server revocation during an outage.

### Example
```dart
import 'package:lythaus_api_client/api.dart';
// TODO Configure API key authorization: refreshCookie
//defaultApiClient.getAuthentication<ApiKeyAuth>('refreshCookie').apiKey = 'YOUR_API_KEY';
// uncomment below to setup prefix (e.g. Bearer) for API key, if needed
//defaultApiClient.getAuthentication<ApiKeyAuth>('refreshCookie').apiKeyPrefix = 'Bearer';

final api = LythausApiClient().getAuthApi();
final String xLythausAuthTransport = xLythausAuthTransport_example; // String |
final AuthLogoutRequest authLogoutRequest = ; // AuthLogoutRequest |

try {
    final response = api.authLogout(xLythausAuthTransport, authLogoutRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authLogout: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **xLythausAuthTransport** | **String**|  | [optional]
 **authLogoutRequest** | [**AuthLogoutRequest**](AuthLogoutRequest.md)|  | [optional]

### Return type

[**AuthLogout200Response**](AuthLogout200Response.md)

### Authorization

[refreshCookie](../README.md#refreshCookie), [bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
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
> AuthPasswordResetRequest202Response authPasswordResetRequest(authPasswordResetRequestRequest, idempotencyKey)

Request an opaque password reset message

Valid accepted requests return the same neutral state for known, unknown and restricted accounts. This proves intake only, not provider acceptance or mailbox delivery. Eligible pending or credentialless legacy accounts receive mailbox-owned credential setup on their existing ID. Dependency failures are not reported as delivered mail.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final AuthPasswordResetRequestRequest authPasswordResetRequestRequest = {"email":"member@example.com","turnstileToken":"turnstile-token"}; // AuthPasswordResetRequestRequest |
final String idempotencyKey = idempotencyKey_example; // String |

try {
    final response = api.authPasswordResetRequest(authPasswordResetRequestRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authPasswordResetRequest: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **authPasswordResetRequestRequest** | [**AuthPasswordResetRequestRequest**](AuthPasswordResetRequestRequest.md)|  |
 **idempotencyKey** | **String**|  | [optional]

### Return type

[**AuthPasswordResetRequest202Response**](AuthPasswordResetRequest202Response.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authRefresh**
> EmailSessionResponse authRefresh(refreshSessionRequest, xLythausAuthTransport)

Rotate a refresh token

Browser cookie-v1 transport requires an allowed Origin, credentials included, and an empty JSON object. Native clients supply the opaque token. Refresh credentials rotate; reused revoked credentials revoke their family.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final RefreshSessionRequest refreshSessionRequest = {"refreshToken":"refresh_example_01K1LYTHAUS"}; // RefreshSessionRequest |
final String xLythausAuthTransport = xLythausAuthTransport_example; // String |

try {
    final response = api.authRefresh(refreshSessionRequest, xLythausAuthTransport);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authRefresh: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **refreshSessionRequest** | [**RefreshSessionRequest**](RefreshSessionRequest.md)|  |
 **xLythausAuthTransport** | **String**|  | [optional]

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
