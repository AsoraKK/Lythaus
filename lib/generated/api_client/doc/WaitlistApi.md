# lythaus_api_client.api.WaitlistApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**joinWaitlist**](WaitlistApi.md#joinwaitlist) | **POST** /waitlist | Join the Lythaus private beta waitlist


# **joinWaitlist**
> WaitlistSuccess joinWaitlist(waitlistSubmission)

Join the Lythaus private beta waitlist

Returns the same neutral success response for new and duplicate submissions.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getWaitlistApi();
final WaitlistSubmission waitlistSubmission = ; // WaitlistSubmission |

try {
    final response = api.joinWaitlist(waitlistSubmission);
    print(response);
} catch on DioException (e) {
    print('Exception when calling WaitlistApi->joinWaitlist: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **waitlistSubmission** | [**WaitlistSubmission**](WaitlistSubmission.md)|  |

### Return type

[**WaitlistSuccess**](WaitlistSuccess.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
