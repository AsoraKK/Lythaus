# lythaus_api_client.api.PostsApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**commentsDelete**](PostsApi.md#commentsdelete) | **DELETE** /comments/{commentId} | Delete my comment
[**commentsReplace**](PostsApi.md#commentsreplace) | **PUT** /comments/{commentId} | Replace my comment body
[**commentsUpdate**](PostsApi.md#commentsupdate) | **PATCH** /comments/{commentId} | Partially update my comment body
[**postsCommentsCreate**](PostsApi.md#postscommentscreate) | **POST** /posts/{postId}/comments | Submit a comment or one-level reply
[**postsCommentsList**](PostsApi.md#postscommentslist) | **GET** /posts/{postId}/comments | List publicly visible comments
[**postsCreate**](PostsApi.md#postscreate) | **POST** /posts | Create a post with moderation and AI authenticity checks
[**postsDelete**](PostsApi.md#postsdelete) | **DELETE** /posts/{id} | Soft-delete a post owned by the authenticated user
[**postsGet**](PostsApi.md#postsget) | **GET** /posts/{id} | Get a post by ID
[**postsReplace**](PostsApi.md#postsreplace) | **PUT** /posts/{id} | Replace editable post fields and return the post to review
[**postsUpdate**](PostsApi.md#postsupdate) | **PATCH** /posts/{id} | Update a post with moderation and AI authenticity checks


# **commentsDelete**
> CommentDeleteResponse commentsDelete(commentId, idempotencyKey)

Delete my comment

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String commentId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.commentsDelete(commentId, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->commentsDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **commentId** | **String**|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**CommentDeleteResponse**](CommentDeleteResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **commentsReplace**
> CommentUpdateResponse commentsReplace(commentId, commentUpdateRequest, idempotencyKey)

Replace my comment body

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String commentId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final CommentUpdateRequest commentUpdateRequest = ; // CommentUpdateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.commentsReplace(commentId, commentUpdateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->commentsReplace: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **commentId** | **String**|  |
 **commentUpdateRequest** | [**CommentUpdateRequest**](CommentUpdateRequest.md)|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**CommentUpdateResponse**](CommentUpdateResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **commentsUpdate**
> CommentUpdateResponse commentsUpdate(commentId, commentUpdateRequest, idempotencyKey)

Partially update my comment body

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String commentId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final CommentUpdateRequest commentUpdateRequest = ; // CommentUpdateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.commentsUpdate(commentId, commentUpdateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->commentsUpdate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **commentId** | **String**|  |
 **commentUpdateRequest** | [**CommentUpdateRequest**](CommentUpdateRequest.md)|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**CommentUpdateResponse**](CommentUpdateResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsCommentsCreate**
> CommentSubmission postsCommentsCreate(postId, commentCreateRequest, idempotencyKey)

Submit a comment or one-level reply

A submission is recorded as under review; it is not immediately published to public comment listings.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String postId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final CommentCreateRequest commentCreateRequest = ; // CommentCreateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.postsCommentsCreate(postId, commentCreateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsCommentsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **postId** | **String**|  |
 **commentCreateRequest** | [**CommentCreateRequest**](CommentCreateRequest.md)|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**CommentSubmission**](CommentSubmission.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsCommentsList**
> CommentPage postsCommentsList(postId, cursor, limit)

List publicly visible comments

Only allowed comments are returned. Anonymous callers may read public posts; authenticated callers additionally receive relationship filtering.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String postId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String cursor = cursor_example; // String | Opaque keyset cursor returned by the preceding page.
final int limit = 56; // int |

try {
    final response = api.postsCommentsList(postId, cursor, limit);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsCommentsList: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **postId** | **String**|  |
 **cursor** | **String**| Opaque keyset cursor returned by the preceding page. | [optional]
 **limit** | **int**|  | [optional] [default to 25]

### Return type

[**CommentPage**](CommentPage.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsCreate**
> Post postsCreate(createPostRequest, idempotencyKey)

Create a post with moderation and AI authenticity checks

Create a post for the authenticated user. An authorship disclosure is required. Human-authored text may publish after review. AI-assisted text may publish only when its normalised, trimmed body is at most 249 user-perceived Unicode characters and receives the categorical `AI-assisted` label. AI-generated public content is blocked and may exist only in an author-private feedback or appeal state where supported.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final CreatePostRequest createPostRequest = {"body":"Local reporting from the community meeting.","declaredCreationMode":"human","geoScope":"community","placeId":"018f2c4e-8c2b-7b4e-8d2a-2e2f0b7e4b1c"}; // CreatePostRequest |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.postsCreate(createPostRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **createPostRequest** | [**CreatePostRequest**](CreatePostRequest.md)|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**Post**](Post.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsDelete**
> PostsDelete200Response postsDelete(id, idempotencyKey)

Soft-delete a post owned by the authenticated user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed.

try {
    final response = api.postsDelete(id, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **idempotencyKey** | **String**| Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. |

### Return type

[**PostsDelete200Response**](PostsDelete200Response.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsGet**
> PostsGet200Response postsGet(id, idempotencyKey)

Get a post by ID

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |
final String idempotencyKey = idempotencyKey_example; // String | Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection.

try {
    final response = api.postsGet(id, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **idempotencyKey** | **String**| Optional caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. If omitted, the mutation executes without replay protection. | [optional]

### Return type

[**PostsGet200Response**](PostsGet200Response.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsReplace**
> PostRevisionResponse postsReplace(id, idempotencyKey, updatePostRequest)

Replace editable post fields and return the post to review

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed.
final UpdatePostRequest updatePostRequest = ; // UpdatePostRequest |

try {
    final response = api.postsReplace(id, idempotencyKey, updatePostRequest);
    print(response);
} catch on DioException (e) {
    print('Exception when calling PostsApi->postsReplace: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **idempotencyKey** | **String**| Required caller-generated replay key. Completed requests, including safe validation failures, replay the stored response. A fresh in-flight duplicate returns `idempotency_in_progress`; an aged or ambiguous claim returns `idempotency_outcome_unknown` and is never automatically re-executed. |
 **updatePostRequest** | [**UpdatePostRequest**](UpdatePostRequest.md)|  |

### Return type

[**PostRevisionResponse**](PostRevisionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postsUpdate**
> PostRevisionResponse postsUpdate(id, updatePostRequest)

Update a post with moderation and AI authenticity checks

Update a post owned by the caller. A body change requires a fresh declaredCreationMode; a visibility-only change preserves the stored declaration. Every accepted update returns the post to review.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getPostsApi();
final String id = id_example; // String |
final UpdatePostRequest updatePostRequest = {"body":"Corrected local reporting from the community meeting.","declaredCreationMode":"human"}; // UpdatePostRequest |

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

[**PostRevisionResponse**](PostRevisionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
