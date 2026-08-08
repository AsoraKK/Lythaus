# lythaus_api_client.api.PostsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**createPost**](PostsApi.md#createpost) | **POST** /post | Create a new post
[**postsBookmarkCreate**](PostsApi.md#postsbookmarkcreate) | **POST** /posts/{id}/bookmark | Bookmark a post
[**postsBookmarkDelete**](PostsApi.md#postsbookmarkdelete) | **DELETE** /posts/{id}/bookmark | Remove a bookmark
[**postsBookmarkGet**](PostsApi.md#postsbookmarkget) | **GET** /posts/{id}/bookmark | Get bookmark status for a post
[**postsCommentsCreate**](PostsApi.md#postscommentscreate) | **POST** /posts/{postId}/comments | Create a comment on a post
[**postsCommentsList**](PostsApi.md#postscommentslist) | **GET** /posts/{postId}/comments | List comments on a post
[**postsCreate**](PostsApi.md#postscreate) | **POST** /posts | Create a post with moderation and AI authenticity checks
[**postsGet**](PostsApi.md#postsget) | **GET** /posts/{id} | Get a post by ID
[**postsInsights**](PostsApi.md#postsinsights) | **GET** /posts/{id}/insights | Get engagement insights for a post
[**postsLikeCreate**](PostsApi.md#postslikecreate) | **POST** /posts/{id}/like | Like a post
[**postsLikeDelete**](PostsApi.md#postslikedelete) | **DELETE** /posts/{id}/like | Unlike a post
[**postsLikeGet**](PostsApi.md#postslikeget) | **GET** /posts/{id}/like | Get like status for a post
[**postsReceipt**](PostsApi.md#postsreceipt) | **GET** /posts/{id}/receipt | Get read receipt for a post
[**postsUpdate**](PostsApi.md#postsupdate) | **PATCH** /posts/{id} | Update a post with moderation and AI authenticity checks
[**postsView**](PostsApi.md#postsview) | **POST** /posts/{id}/view | Record a post view event


# **createPost**
> LegacyCreatePostResponse createPost(createPostRequest)

Create a new post

Create a new post.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final CreatePostRequest createPostRequest = {"text":"Launch checklist is locked and ready for review.","aiLabel":"human"}; // CreatePostRequest |

try {
    final response = api.createPost(createPostRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->createPost: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **createPostRequest** | [**CreatePostRequest**](CreatePostRequest.md)|  |

### Return type

[**LegacyCreatePostResponse**](LegacyCreatePostResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsBookmarkCreate**
> JsonObject postsBookmarkCreate(id, body)

Bookmark a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.postsBookmarkCreate(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsBookmarkCreate: $e\n');
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

# **postsBookmarkDelete**
> JsonObject postsBookmarkDelete(id)

Remove a bookmark

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |

try {
    final response = api.postsBookmarkDelete(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsBookmarkDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsBookmarkGet**
> JsonObject postsBookmarkGet(id)

Get bookmark status for a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |

try {
    final response = api.postsBookmarkGet(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsBookmarkGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsCommentsCreate**
> JsonObject postsCommentsCreate(postId, body)

Create a comment on a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String postId = postId_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.postsCommentsCreate(postId, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsCommentsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **postId** | **String**|  |
 **body** | **JsonObject**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsCommentsList**
> JsonObject postsCommentsList(postId)

List comments on a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String postId = postId_example; // String |

try {
    final response = api.postsCommentsList(postId);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsCommentsList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **postId** | **String**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsCreate**
> Post postsCreate(createPostRequest)

Create a post with moderation and AI authenticity checks

Create a post for the authenticated user. An authorship disclosure is required. Disclosed AI-assisted and AI-generated content may be published with categorical labels; conflicts or unavailable classification enter review. Prohibited content remains blocked regardless of authorship.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final CreatePostRequest createPostRequest = ; // CreatePostRequest |

try {
    final response = api.postsCreate(createPostRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **createPostRequest** | [**CreatePostRequest**](CreatePostRequest.md)|  |

### Return type

[**Post**](Post.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsGet**
> PostView postsGet(id)

Get a post by ID

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |

try {
    final response = api.postsGet(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**PostView**](PostView.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsInsights**
> JsonObject postsInsights(id)

Get engagement insights for a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |

try {
    final response = api.postsInsights(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsInsights: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsLikeCreate**
> JsonObject postsLikeCreate(id, body)

Like a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.postsLikeCreate(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsLikeCreate: $e\n');
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

# **postsLikeDelete**
> JsonObject postsLikeDelete(id)

Unlike a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |

try {
    final response = api.postsLikeDelete(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsLikeDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsLikeGet**
> JsonObject postsLikeGet(id)

Get like status for a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |

try {
    final response = api.postsLikeGet(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsLikeGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsReceipt**
> JsonObject postsReceipt(id)

Get read receipt for a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |

try {
    final response = api.postsReceipt(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsReceipt: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**JsonObject**](JsonObject.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsUpdate**
> Post postsUpdate(id, updatePostRequest)

Update a post with moderation and AI authenticity checks

Update a post owned by the caller. Content or media changes require a new authorship disclosure. Conflicts or unavailable classification enter review; prohibited content remains blocked regardless of authorship.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |
final UpdatePostRequest updatePostRequest = ; // UpdatePostRequest |

try {
    final response = api.postsUpdate(id, updatePostRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **updatePostRequest** | [**UpdatePostRequest**](UpdatePostRequest.md)|  |

### Return type

[**Post**](Post.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsView**
> JsonObject postsView(id, body)

Record a post view event

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |
final JsonObject body = Object; // JsonObject |

try {
    final response = api.postsView(id, body);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsView: $e\n');
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
