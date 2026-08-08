# lythaus_api_client.api.NotificationsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**notificationsDevicesCreate**](NotificationsApi.md#notificationsdevicescreate) | **POST** /notifications/devices | Register a push device token
[**notificationsDevicesList**](NotificationsApi.md#notificationsdeviceslist) | **GET** /notifications/devices | List registered push devices
[**notificationsDevicesRevoke**](NotificationsApi.md#notificationsdevicesrevoke) | **POST** /notifications/devices/{id}/revoke | Revoke a push device registration
[**notificationsDismiss**](NotificationsApi.md#notificationsdismiss) | **POST** /notifications/{id}/dismiss | Dismiss a notification
[**notificationsList**](NotificationsApi.md#notificationslist) | **GET** /notifications | List notifications for the current user
[**notificationsPreferencesGet**](NotificationsApi.md#notificationspreferencesget) | **GET** /notifications/preferences | Get notification preferences
[**notificationsPreferencesUpdate**](NotificationsApi.md#notificationspreferencesupdate) | **PUT** /notifications/preferences | Update notification preferences
[**notificationsRead**](NotificationsApi.md#notificationsread) | **POST** /notifications/{id}/read | Mark a notification as read
[**notificationsSend**](NotificationsApi.md#notificationssend) | **POST** /notifications/send | Send an admin-triggered notification
[**notificationsUnreadCount**](NotificationsApi.md#notificationsunreadcount) | **GET** /notifications/unread-count | Get unread notification count


# **notificationsDevicesCreate**
> JsonObject notificationsDevicesCreate(body)

Register a push device token

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.notificationsDevicesCreate(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsDevicesCreate: $e\n');
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

# **notificationsDevicesList**
> JsonObject notificationsDevicesList()

List registered push devices

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();

try {
    final response = api.notificationsDevicesList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsDevicesList: $e\n');
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

# **notificationsDevicesRevoke**
> JsonObject notificationsDevicesRevoke(id, body)

Revoke a push device registration

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.notificationsDevicesRevoke(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsDevicesRevoke: $e\n');
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

# **notificationsDismiss**
> JsonObject notificationsDismiss(id, body)

Dismiss a notification

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.notificationsDismiss(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsDismiss: $e\n');
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

# **notificationsList**
> JsonObject notificationsList()

List notifications for the current user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();

try {
    final response = api.notificationsList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsList: $e\n');
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

# **notificationsPreferencesGet**
> JsonObject notificationsPreferencesGet()

Get notification preferences

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();

try {
    final response = api.notificationsPreferencesGet();
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsPreferencesGet: $e\n');
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

# **notificationsPreferencesUpdate**
> JsonObject notificationsPreferencesUpdate(body)

Update notification preferences

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.notificationsPreferencesUpdate(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsPreferencesUpdate: $e\n');
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

# **notificationsRead**
> JsonObject notificationsRead(id, body)

Mark a notification as read

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.notificationsRead(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsRead: $e\n');
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

# **notificationsSend**
> JsonObject notificationsSend(body)

Send an admin-triggered notification

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final JsonObject body = Object; // JsonObject |

try {
    final response = api.notificationsSend(body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsSend: $e\n');
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

# **notificationsUnreadCount**
> JsonObject notificationsUnreadCount()

Get unread notification count

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();

try {
    final response = api.notificationsUnreadCount();
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsUnreadCount: $e\n');
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
