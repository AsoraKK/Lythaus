# lythaus_api_client.api.AuthApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**authEmailLogin**](AuthApi.md#authemaillogin) | **POST** /auth/email | Sign in with a verified email identity
[**authInviteValidate**](AuthApi.md#authinvitevalidate) | **GET** /auth/invite/validate | Validate an invite code
[**authPing**](AuthApi.md#authping) | **GET** /auth/ping | Verify authentication token is valid
[**authRedeemInvite**](AuthApi.md#authredeeminvite) | **POST** /auth/redeem-invite | Redeem an invite code to activate account
[**authRefresh**](AuthApi.md#authrefresh) | **POST** /auth/refresh | Rotate a refresh token
[**authSessionsRevoke**](AuthApi.md#authsessionsrevoke) | **POST** /auth/sessions/revoke | Revoke an active session
[**authUserInfo**](AuthApi.md#authuserinfo) | **GET** /auth/userinfo | Return the current email-authenticated user
[**authUserInfoPost**](AuthApi.md#authuserinfopost) | **POST** /auth/userinfo | OIDC UserInfo endpoint (POST)


# **authEmailLogin**
> EmailSessionResponse authEmailLogin(emailLoginRequest)

Sign in with a verified email identity

Creates a Lythaus access and refresh session for a verified email account.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final EmailLoginRequest emailLoginRequest = {"mode":"login","email":"alice@example.com","password":"correct-horse-battery-staple"}; // EmailLoginRequest |

try {
    final response = api.authEmailLogin(emailLoginRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authEmailLogin: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **emailLoginRequest** | [**EmailLoginRequest**](EmailLoginRequest.md)|  |

### Return type

[**EmailSessionResponse**](EmailSessionResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authInviteValidate**
> InviteValidationResponse authInviteValidate(code)

Validate an invite code

Validates an invite code without revealing status details.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final String code = code_example; // String | Invite code (format XXXX-XXXX)

try {
    final response = api.authInviteValidate(code);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authInviteValidate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **code** | **String**| Invite code (format XXXX-XXXX) | [optional]

### Return type

[**InviteValidationResponse**](InviteValidationResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authPing**
> JsonObject authPing()

Verify authentication token is valid

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();

try {
    final response = api.authPing();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authPing: $e\n');
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

# **authRedeemInvite**
> RedeemInviteResponse authRedeemInvite(redeemInviteRequest)

Redeem an invite code to activate account

Allows an authenticated but inactive user to redeem a valid invite code. On success the user is activated and a fresh token pair is returned.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final RedeemInviteRequest redeemInviteRequest = {"inviteCode":"ABCD-1234"}; // RedeemInviteRequest |

try {
    final response = api.authRedeemInvite(redeemInviteRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authRedeemInvite: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **redeemInviteRequest** | [**RedeemInviteRequest**](RedeemInviteRequest.md)|  |

### Return type

[**RedeemInviteResponse**](RedeemInviteResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authRefresh**
> JsonObject authRefresh(body)

Rotate a refresh token

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.authRefresh(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authRefresh: $e\n');
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

# **authSessionsRevoke**
> JsonObject authSessionsRevoke(body)

Revoke an active session

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.authSessionsRevoke(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authSessionsRevoke: $e\n');
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

# **authUserInfo**
> UserInfoResponse authUserInfo()

Return the current email-authenticated user

Returns the active Lythaus account associated with the bearer session.

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

[**UserInfoResponse**](UserInfoResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **authUserInfoPost**
> UserInfoResponse authUserInfoPost()

OIDC UserInfo endpoint (POST)

POST variant of the UserInfo endpoint for clients that cannot use query strings.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getAuthApi();

try {
    final response = api.authUserInfoPost();
    print(response);
} catch on DioException (e) {
    print('Exception when calling AuthApi->authUserInfoPost: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**UserInfoResponse**](UserInfoResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/x-www-form-urlencoded
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
