# lythaus_api_client.api.ReputationApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**reputationLedgerGet**](ReputationApi.md#reputationledgerget) | **GET** /reputation/me/ledger | List my Reputation V2 ledger
[**reputationMeGet**](ReputationApi.md#reputationmeget) | **GET** /reputation/me | Get my private Reputation V2 summary
[**reputationUserGet**](ReputationApi.md#reputationuserget) | **GET** /reputation/users/{id} | Get public Reputation V2 summary
[**reputationUserGetSingular**](ReputationApi.md#reputationusergetsingular) | **GET** /reputation/user/{id} | Get public Reputation V2 summary (compatibility alias)


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
