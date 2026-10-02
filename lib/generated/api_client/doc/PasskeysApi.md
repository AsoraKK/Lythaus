# lythaus_api_client.api.PasskeysApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**listPasskeys**](PasskeysApi.md#listpasskeys) | **GET** /auth/passkeys/credentials | List your active passkeys
[**passkeyCapabilities**](PasskeysApi.md#passkeycapabilities) | **GET** /auth/passkeys/capabilities | Check optional passkey availability
[**passkeyLoginOptions**](PasskeysApi.md#passkeyloginoptions) | **POST** /auth/passkeys/login/options | Start passkey login
[**passkeyLoginVerify**](PasskeysApi.md#passkeyloginverify) | **POST** /auth/passkeys/login/verify | Verify passkey login
[**passkeyMaintenanceOptions**](PasskeysApi.md#passkeymaintenanceoptions) | **POST** /auth/passkeys/maintenance/options | Start passkey maintenance
[**passkeyMaintenanceVerify**](PasskeysApi.md#passkeymaintenanceverify) | **POST** /auth/passkeys/maintenance/verify | Verify passkey maintenance
[**passkeyRegisterOptions**](PasskeysApi.md#passkeyregisteroptions) | **POST** /auth/passkeys/register/options | Start passkey register
[**passkeyRegisterVerify**](PasskeysApi.md#passkeyregisterverify) | **POST** /auth/passkeys/register/verify | Verify passkey register
[**renamePasskey**](PasskeysApi.md#renamepasskey) | **PATCH** /auth/passkeys/credentials/{passkeyId} | Rename your passkey
[**revokePasskey**](PasskeysApi.md#revokepasskey) | **POST** /auth/passkeys/credentials/{passkeyId}/revoke | Remove your passkey


# **listPasskeys**
> PasskeyCredentialList listPasskeys(origin, xLythausAuthTransport)

List your active passkeys

Owner-only names, backup state and timestamps. Public keys, authenticator credential IDs and user handles are omitted.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPasskeysApi();
final String origin = origin_example; // String | Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
final String xLythausAuthTransport = xLythausAuthTransport_example; // String |

try {
    final response = api.listPasskeys(origin, xLythausAuthTransport);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PasskeysApi->listPasskeys: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS. |
 **xLythausAuthTransport** | **String**|  |

### Return type

[**PasskeyCredentialList**](PasskeyCredentialList.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **passkeyCapabilities**
> PasskeyCapability passkeyCapabilities(origin, xLythausAuthTransport)

Check optional passkey availability

Disabled by default. Returns enabled:false without schema access when the feature flag is off. Browser support is checked locally.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPasskeysApi();
final String origin = origin_example; // String | Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
final String xLythausAuthTransport = xLythausAuthTransport_example; // String |

try {
    final response = api.passkeyCapabilities(origin, xLythausAuthTransport);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PasskeysApi->passkeyCapabilities: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS. |
 **xLythausAuthTransport** | **String**|  |

### Return type

[**PasskeyCapability**](PasskeyCapability.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **passkeyLoginOptions**
> PasskeyChallenge passkeyLoginOptions(origin, xLythausAuthTransport, body)

Start passkey login

Five-minute, single-use challenge with exact origin and RP binding. Enrollment requires current password and a verified email account. Authenticated ceremonies are bound to the current access token and account token version. Anonymous login sets an HttpOnly Secure SameSite=Strict ceremony binding cookie. User verification is required; enrollment uses discoverable credentials and attestation:none.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPasskeysApi();
final String origin = origin_example; // String | Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
final String xLythausAuthTransport = xLythausAuthTransport_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.passkeyLoginOptions(origin, xLythausAuthTransport, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PasskeysApi->passkeyLoginOptions: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS. |
 **xLythausAuthTransport** | **String**|  |
 **body** | **JsonObject**|  |

### Return type

[**PasskeyChallenge**](PasskeyChallenge.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **passkeyLoginVerify**
> PasskeySession passkeyLoginVerify(origin, xLythausAuthTransport, passkeyCeremonyRequest)

Verify passkey login

Verifies the SimpleWebAuthn credential response, exact challenge/origin/RP, user verification and ownership. Challenges are consumed atomically before cryptographic verification, including failed attempts. Login requires the ceremony binding cookie and returns a standard session with the refresh token only in an HttpOnly cookie. Maintenance records at most one shared zero-point evidence event per owner/policy/UTC month. No reward weights are activated.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPasskeysApi();
final String origin = origin_example; // String | Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
final String xLythausAuthTransport = xLythausAuthTransport_example; // String |
final PasskeyCeremonyRequest passkeyCeremonyRequest = ; // PasskeyCeremonyRequest |

try {
    final response = api.passkeyLoginVerify(origin, xLythausAuthTransport, passkeyCeremonyRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PasskeysApi->passkeyLoginVerify: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS. |
 **xLythausAuthTransport** | **String**|  |
 **passkeyCeremonyRequest** | [**PasskeyCeremonyRequest**](PasskeyCeremonyRequest.md)|  |

### Return type

[**PasskeySession**](PasskeySession.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **passkeyMaintenanceOptions**
> PasskeyChallenge passkeyMaintenanceOptions(origin, xLythausAuthTransport, body)

Start passkey maintenance

Five-minute, single-use challenge with exact origin and RP binding. Enrollment requires current password and a verified email account. Authenticated ceremonies are bound to the current access token and account token version. Anonymous login sets an HttpOnly Secure SameSite=Strict ceremony binding cookie. User verification is required; enrollment uses discoverable credentials and attestation:none.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPasskeysApi();
final String origin = origin_example; // String | Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
final String xLythausAuthTransport = xLythausAuthTransport_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.passkeyMaintenanceOptions(origin, xLythausAuthTransport, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PasskeysApi->passkeyMaintenanceOptions: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS. |
 **xLythausAuthTransport** | **String**|  |
 **body** | **JsonObject**|  |

### Return type

[**PasskeyChallenge**](PasskeyChallenge.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **passkeyMaintenanceVerify**
> PasskeyMaintenance passkeyMaintenanceVerify(origin, xLythausAuthTransport, passkeyCeremonyRequest)

Verify passkey maintenance

Verifies the SimpleWebAuthn credential response, exact challenge/origin/RP, user verification and ownership. Challenges are consumed atomically before cryptographic verification, including failed attempts. Login requires the ceremony binding cookie and returns a standard session with the refresh token only in an HttpOnly cookie. Maintenance records at most one shared zero-point evidence event per owner/policy/UTC month. No reward weights are activated.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPasskeysApi();
final String origin = origin_example; // String | Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
final String xLythausAuthTransport = xLythausAuthTransport_example; // String |
final PasskeyCeremonyRequest passkeyCeremonyRequest = ; // PasskeyCeremonyRequest |

try {
    final response = api.passkeyMaintenanceVerify(origin, xLythausAuthTransport, passkeyCeremonyRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PasskeysApi->passkeyMaintenanceVerify: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS. |
 **xLythausAuthTransport** | **String**|  |
 **passkeyCeremonyRequest** | [**PasskeyCeremonyRequest**](PasskeyCeremonyRequest.md)|  |

### Return type

[**PasskeyMaintenance**](PasskeyMaintenance.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **passkeyRegisterOptions**
> PasskeyChallenge passkeyRegisterOptions(origin, xLythausAuthTransport, passkeyRegisterOptionsRequest)

Start passkey register

Five-minute, single-use challenge with exact origin and RP binding. Enrollment requires current password and a verified email account. Authenticated ceremonies are bound to the current access token and account token version. Anonymous login sets an HttpOnly Secure SameSite=Strict ceremony binding cookie. User verification is required; enrollment uses discoverable credentials and attestation:none.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPasskeysApi();
final String origin = origin_example; // String | Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
final String xLythausAuthTransport = xLythausAuthTransport_example; // String |
final PasskeyRegisterOptionsRequest passkeyRegisterOptionsRequest = ; // PasskeyRegisterOptionsRequest |

try {
    final response = api.passkeyRegisterOptions(origin, xLythausAuthTransport, passkeyRegisterOptionsRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PasskeysApi->passkeyRegisterOptions: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS. |
 **xLythausAuthTransport** | **String**|  |
 **passkeyRegisterOptionsRequest** | [**PasskeyRegisterOptionsRequest**](PasskeyRegisterOptionsRequest.md)|  |

### Return type

[**PasskeyChallenge**](PasskeyChallenge.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **passkeyRegisterVerify**
> PasskeyEnrollment passkeyRegisterVerify(origin, xLythausAuthTransport, passkeyCeremonyRequest)

Verify passkey register

Verifies the SimpleWebAuthn credential response, exact challenge/origin/RP, user verification and ownership. Challenges are consumed atomically before cryptographic verification, including failed attempts. Login requires the ceremony binding cookie and returns a standard session with the refresh token only in an HttpOnly cookie. Maintenance records at most one shared zero-point evidence event per owner/policy/UTC month. No reward weights are activated.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPasskeysApi();
final String origin = origin_example; // String | Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
final String xLythausAuthTransport = xLythausAuthTransport_example; // String |
final PasskeyCeremonyRequest passkeyCeremonyRequest = ; // PasskeyCeremonyRequest |

try {
    final response = api.passkeyRegisterVerify(origin, xLythausAuthTransport, passkeyCeremonyRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PasskeysApi->passkeyRegisterVerify: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS. |
 **xLythausAuthTransport** | **String**|  |
 **passkeyCeremonyRequest** | [**PasskeyCeremonyRequest**](PasskeyCeremonyRequest.md)|  |

### Return type

[**PasskeyEnrollment**](PasskeyEnrollment.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **renamePasskey**
> PasskeyRenameResult renamePasskey(origin, xLythausAuthTransport, passkeyId, passkeyRenameRequest)

Rename your passkey

Requires a current active owner session.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPasskeysApi();
final String origin = origin_example; // String | Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
final String xLythausAuthTransport = xLythausAuthTransport_example; // String |
final String passkeyId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final PasskeyRenameRequest passkeyRenameRequest = ; // PasskeyRenameRequest |

try {
    final response = api.renamePasskey(origin, xLythausAuthTransport, passkeyId, passkeyRenameRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PasskeysApi->renamePasskey: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS. |
 **xLythausAuthTransport** | **String**|  |
 **passkeyId** | **String**|  |
 **passkeyRenameRequest** | [**PasskeyRenameRequest**](PasskeyRenameRequest.md)|  |

### Return type

[**PasskeyRenameResult**](PasskeyRenameResult.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **revokePasskey**
> PasskeyRevokeResult revokePasskey(origin, xLythausAuthTransport, passkeyId, passkeyRevokeRequest)

Remove your passkey

Requires the current account password and owner session. Revokes all auth sessions and refresh families, and increments token_version. Email/password and recovery remain available.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPasskeysApi();
final String origin = origin_example; // String | Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS.
final String xLythausAuthTransport = xLythausAuthTransport_example; // String |
final String passkeyId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final PasskeyRevokeRequest passkeyRevokeRequest = ; // PasskeyRevokeRequest |

try {
    final response = api.revokePasskey(origin, xLythausAuthTransport, passkeyId, passkeyRevokeRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PasskeysApi->revokePasskey: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **origin** | **String**| Exact HTTPS PWA origin authorized by PASSKEY_ALLOWED_ORIGINS and CORS_ALLOWED_ORIGINS. |
 **xLythausAuthTransport** | **String**|  |
 **passkeyId** | **String**|  |
 **passkeyRevokeRequest** | [**PasskeyRevokeRequest**](PasskeyRevokeRequest.md)|  |

### Return type

[**PasskeyRevokeResult**](PasskeyRevokeResult.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
