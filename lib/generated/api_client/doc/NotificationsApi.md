# lythaus_api_client.api.NotificationsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**notificationsDevicesCreate**](NotificationsApi.md#notificationsdevicescreate) | **POST** /notifications/devices | Register or reactivate a push device
[**notificationsDevicesList**](NotificationsApi.md#notificationsdeviceslist) | **GET** /notifications/devices | List my push devices
[**notificationsDevicesRevoke**](NotificationsApi.md#notificationsdevicesrevoke) | **POST** /notifications/devices/{id}/revoke | Revoke a push device
[**notificationsDismiss**](NotificationsApi.md#notificationsdismiss) | **POST** /notifications/{id}/dismiss | Dismiss a notification
[**notificationsList**](NotificationsApi.md#notificationslist) | **GET** /notifications | List my notifications
[**notificationsPreferencesGet**](NotificationsApi.md#notificationspreferencesget) | **GET** /notifications/preferences | Get notification preferences
[**notificationsPreferencesReplace**](NotificationsApi.md#notificationspreferencesreplace) | **PUT** /notifications/preferences | Replace notification preferences
[**notificationsPreferencesUpdate**](NotificationsApi.md#notificationspreferencesupdate) | **PATCH** /notifications/preferences | Partially update notification preferences
[**notificationsRead**](NotificationsApi.md#notificationsread) | **POST** /notifications/{id}/read | Mark a notification read
[**notificationsUnreadCount**](NotificationsApi.md#notificationsunreadcount) | **GET** /notifications/unread-count | Get my unread notification count


# **notificationsDevicesCreate**
> NotificationDeviceCreated notificationsDevicesCreate(notificationDeviceCreate)

Register or reactivate a push device

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final NotificationDeviceCreate notificationDeviceCreate = ; // NotificationDeviceCreate |

try {
    final response = api.notificationsDevicesCreate(notificationDeviceCreate);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsDevicesCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **notificationDeviceCreate** | [**NotificationDeviceCreate**](NotificationDeviceCreate.md)|  |

### Return type

[**NotificationDeviceCreated**](NotificationDeviceCreated.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **notificationsDevicesList**
> NotificationDeviceList notificationsDevicesList()

List my push devices

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

[**NotificationDeviceList**](NotificationDeviceList.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **notificationsDevicesRevoke**
> NotificationDeviceRevoked notificationsDevicesRevoke(id)

Revoke a push device

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.notificationsDevicesRevoke(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsDevicesRevoke: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**NotificationDeviceRevoked**](NotificationDeviceRevoked.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **notificationsDismiss**
> NotificationActionResponse notificationsDismiss(id, idempotencyKey)

Dismiss a notification

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.notificationsDismiss(id, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsDismiss: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**NotificationActionResponse**](NotificationActionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **notificationsList**
> NotificationPage notificationsList(cursor, limit)

List my notifications

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final String cursor = cursor_example; // String | Opaque keyset cursor returned by the preceding page.
final int limit = 56; // int |

try {
    final response = api.notificationsList(cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **cursor** | **String**| Opaque keyset cursor returned by the preceding page. | [optional]
 **limit** | **int**|  | [optional] [default to 25]

### Return type

[**NotificationPage**](NotificationPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **notificationsPreferencesGet**
> NotificationPreferences notificationsPreferencesGet()

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

[**NotificationPreferences**](NotificationPreferences.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **notificationsPreferencesReplace**
> NotificationPreferences notificationsPreferencesReplace(notificationPreferenceUpdate, idempotencyKey)

Replace notification preferences

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final NotificationPreferenceUpdate notificationPreferenceUpdate = ; // NotificationPreferenceUpdate |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.notificationsPreferencesReplace(notificationPreferenceUpdate, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsPreferencesReplace: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **notificationPreferenceUpdate** | [**NotificationPreferenceUpdate**](NotificationPreferenceUpdate.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**NotificationPreferences**](NotificationPreferences.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **notificationsPreferencesUpdate**
> NotificationPreferences notificationsPreferencesUpdate(notificationPreferenceUpdate, idempotencyKey)

Partially update notification preferences

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final NotificationPreferenceUpdate notificationPreferenceUpdate = ; // NotificationPreferenceUpdate |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.notificationsPreferencesUpdate(notificationPreferenceUpdate, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsPreferencesUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **notificationPreferenceUpdate** | [**NotificationPreferenceUpdate**](NotificationPreferenceUpdate.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**NotificationPreferences**](NotificationPreferences.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **notificationsRead**
> NotificationActionResponse notificationsRead(id, idempotencyKey)

Mark a notification read

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getNotificationsApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.notificationsRead(id, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling NotificationsApi->notificationsRead: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**NotificationActionResponse**](NotificationActionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **notificationsUnreadCount**
> NotificationUnreadCount notificationsUnreadCount()

Get my unread notification count

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

[**NotificationUnreadCount**](NotificationUnreadCount.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
