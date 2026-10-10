# lythaus_api_client.api.CommentsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**commentsOwnerView**](CommentsApi.md#commentsownerview) | **GET** /comments/{commentId}/owner-view | Read the author&#39;s own allowed or pending comment
[**usersMeCommentsList**](CommentsApi.md#usersmecommentslist) | **GET** /users/me/comments | List my own comments and replies


# **commentsOwnerView**
> CommentsOwnerView200Response commentsOwnerView(commentId)

Read the author's own allowed or pending comment

Known-ID read bound to the comment author, regardless of post ownership. No foreign parent body or moderation signals are exposed.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCommentsApi();
final String commentId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.commentsOwnerView(commentId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling CommentsApi->commentsOwnerView: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **commentId** | **String**|  |

### Return type

[**CommentsOwnerView200Response**](CommentsOwnerView200Response.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **usersMeCommentsList**
> OwnerCommentsPage usersMeCommentsList(limit, cursor)

List my own comments and replies

Private newest-first cursor collection bound to the active JWT subject. Returns only the author's non-deleted allowed or pending human or AI-assisted comments on currently accessible allowed posts, using existing post visibility, authorship, follow, block and public-label rules. Deleted, blocked or inactive content and foreign bodies are excluded. Parent comment bodies are never returned.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getCommentsApi();
final int limit = 56; // int |
final String cursor = cursor_example; // String |

try {
    final response = api.usersMeCommentsList(limit, cursor);
    print(response);
} catch on DioException (e) {
    print('Exception when calling CommentsApi->usersMeCommentsList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **limit** | **int**|  | [optional] [default to 8]
 **cursor** | **String**|  | [optional]

### Return type

[**OwnerCommentsPage**](OwnerCommentsPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
