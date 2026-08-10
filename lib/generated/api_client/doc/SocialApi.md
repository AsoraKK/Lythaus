# lythaus_api_client.api.SocialApi

## Load the API package
```dart
import 'package:lythaus_api_client/api.dart';
```

All URIs are relative to *https://api.lythaus.co/api*

Method | HTTP request | Description
------------- | ------------- | -------------
[**blocksCreate**](SocialApi.md#blockscreate) | **POST** /blocks | Block a user
[**blocksDelete**](SocialApi.md#blocksdelete) | **DELETE** /blocks/{id} | Unblock a user
[**blocksList**](SocialApi.md#blockslist) | **GET** /blocks | List my blocks
[**bookmarksCreate**](SocialApi.md#bookmarkscreate) | **POST** /bookmarks | Bookmark a post
[**bookmarksDelete**](SocialApi.md#bookmarksdelete) | **DELETE** /bookmarks/{postId} | Remove a bookmark
[**bookmarksList**](SocialApi.md#bookmarkslist) | **GET** /bookmarks | List my private bookmarks
[**followsCreate**](SocialApi.md#followscreate) | **POST** /follows | Follow a user
[**followsDelete**](SocialApi.md#followsdelete) | **DELETE** /follows/{followedId} | Unfollow a user
[**mutesCreate**](SocialApi.md#mutescreate) | **POST** /mutes | Mute a user
[**mutesDelete**](SocialApi.md#mutesdelete) | **DELETE** /mutes/{id} | Unmute a user
[**mutesList**](SocialApi.md#muteslist) | **GET** /mutes | List my mutes
[**postReactionsCreate**](SocialApi.md#postreactionscreate) | **POST** /posts/{postId}/reactions | Set my current reaction on a post
[**postReactionsDelete**](SocialApi.md#postreactionsdelete) | **DELETE** /posts/{postId}/reactions | Remove my current reaction from a post
[**postReactionsReplace**](SocialApi.md#postreactionsreplace) | **PUT** /posts/{postId}/reactions | Replace my current reaction on a post
[**usersBlockCreate**](SocialApi.md#usersblockcreate) | **POST** /users/block | Block a user
[**usersFollowCreate**](SocialApi.md#usersfollowcreate) | **POST** /users/{id}/follow | Follow the path user
[**usersFollowDelete**](SocialApi.md#usersfollowdelete) | **DELETE** /users/{id}/follow | Unfollow the path user
[**usersFollowGet**](SocialApi.md#usersfollowget) | **GET** /users/{id}/follow | Get my relationship with a user
[**usersFollowLegacyCreate**](SocialApi.md#usersfollowlegacycreate) | **POST** /users/follow | Follow a user
[**usersMuteCreate**](SocialApi.md#usersmutecreate) | **POST** /users/mute | Mute a user


# **blocksCreate**
> RelationChange blocksCreate(targetUserRequest, idempotencyKey)

Block a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final TargetUserRequest targetUserRequest = ; // TargetUserRequest |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.blocksCreate(targetUserRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->blocksCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **targetUserRequest** | [**TargetUserRequest**](TargetUserRequest.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**RelationChange**](RelationChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **blocksDelete**
> RelationChange blocksDelete(id, idempotencyKey)

Unblock a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.blocksDelete(id, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->blocksDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**RelationChange**](RelationChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **blocksList**
> RelationList blocksList()

List my blocks

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();

try {
    final response = api.blocksList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->blocksList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**RelationList**](RelationList.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **bookmarksCreate**
> BookmarkChange bookmarksCreate(bookmarkCreateRequest, idempotencyKey)

Bookmark a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final BookmarkCreateRequest bookmarkCreateRequest = ; // BookmarkCreateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.bookmarksCreate(bookmarkCreateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->bookmarksCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **bookmarkCreateRequest** | [**BookmarkCreateRequest**](BookmarkCreateRequest.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**BookmarkChange**](BookmarkChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **bookmarksDelete**
> BookmarkChange bookmarksDelete(postId, idempotencyKey)

Remove a bookmark

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final String postId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.bookmarksDelete(postId, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->bookmarksDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **postId** | **String**|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**BookmarkChange**](BookmarkChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **bookmarksList**
> BookmarkList bookmarksList()

List my private bookmarks

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();

try {
    final response = api.bookmarksList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->bookmarksList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**BookmarkList**](BookmarkList.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **followsCreate**
> FollowChange followsCreate(followCreateRequest, idempotencyKey)

Follow a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final FollowCreateRequest followCreateRequest = ; // FollowCreateRequest |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.followsCreate(followCreateRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->followsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **followCreateRequest** | [**FollowCreateRequest**](FollowCreateRequest.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**FollowChange**](FollowChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **followsDelete**
> FollowChange followsDelete(followedId, idempotencyKey)

Unfollow a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final String followedId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.followsDelete(followedId, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->followsDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **followedId** | **String**|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**FollowChange**](FollowChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **mutesCreate**
> RelationChange mutesCreate(targetUserRequest, idempotencyKey)

Mute a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final TargetUserRequest targetUserRequest = ; // TargetUserRequest |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.mutesCreate(targetUserRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->mutesCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **targetUserRequest** | [**TargetUserRequest**](TargetUserRequest.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**RelationChange**](RelationChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **mutesDelete**
> RelationChange mutesDelete(id, idempotencyKey)

Unmute a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.mutesDelete(id, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->mutesDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**RelationChange**](RelationChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **mutesList**
> RelationList mutesList()

List my mutes

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();

try {
    final response = api.mutesList();
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->mutesList: $e\n');
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**RelationList**](RelationList.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postReactionsCreate**
> ReactionResponse postReactionsCreate(postId, reactionRequest, idempotencyKey)

Set my current reaction on a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final String postId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ReactionRequest reactionRequest = ; // ReactionRequest |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.postReactionsCreate(postId, reactionRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->postReactionsCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **postId** | **String**|  |
 **reactionRequest** | [**ReactionRequest**](ReactionRequest.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**ReactionResponse**](ReactionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postReactionsDelete**
> ReactionDeleteResponse postReactionsDelete(postId, idempotencyKey)

Remove my current reaction from a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final String postId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.postReactionsDelete(postId, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->postReactionsDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **postId** | **String**|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**ReactionDeleteResponse**](ReactionDeleteResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **postReactionsReplace**
> ReactionResponse postReactionsReplace(postId, reactionRequest, idempotencyKey)

Replace my current reaction on a post

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final String postId = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final ReactionRequest reactionRequest = ; // ReactionRequest |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.postReactionsReplace(postId, reactionRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->postReactionsReplace: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **postId** | **String**|  |
 **reactionRequest** | [**ReactionRequest**](ReactionRequest.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**ReactionResponse**](ReactionResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **usersBlockCreate**
> RelationChange usersBlockCreate(targetUserRequest, idempotencyKey)

Block a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final TargetUserRequest targetUserRequest = ; // TargetUserRequest |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.usersBlockCreate(targetUserRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->usersBlockCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **targetUserRequest** | [**TargetUserRequest**](TargetUserRequest.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**RelationChange**](RelationChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **usersFollowCreate**
> FollowChange usersFollowCreate(id, idempotencyKey)

Follow the path user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.usersFollowCreate(id, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->usersFollowCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**FollowChange**](FollowChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **usersFollowDelete**
> FollowChange usersFollowDelete(id, idempotencyKey)

Unfollow the path user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.usersFollowDelete(id, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->usersFollowDelete: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**FollowChange**](FollowChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **usersFollowGet**
> FollowStatus usersFollowGet(id)

Get my relationship with a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final String id = 38400000-8cf0-11bd-b23e-10b96e4ef00d; // String |

try {
    final response = api.usersFollowGet(id);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->usersFollowGet: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **String**|  |

### Return type

[**FollowStatus**](FollowStatus.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **usersFollowLegacyCreate**
> FollowChange usersFollowLegacyCreate(targetUserRequest, idempotencyKey)

Follow a user

Compatibility alias for `POST /follows`.

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final TargetUserRequest targetUserRequest = ; // TargetUserRequest |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.usersFollowLegacyCreate(targetUserRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->usersFollowLegacyCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **targetUserRequest** | [**TargetUserRequest**](TargetUserRequest.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**FollowChange**](FollowChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **usersMuteCreate**
> RelationChange usersMuteCreate(targetUserRequest, idempotencyKey)

Mute a user

### Example
```dart
import 'package:lythaus_api_client/api.dart';

final api = LythausApiClient().getSocialApi();
final TargetUserRequest targetUserRequest = ; // TargetUserRequest |
final String idempotencyKey = idempotencyKey_example; // String | Caller-generated replay key. Completed retries return the stored response.

try {
    final response = api.usersMuteCreate(targetUserRequest, idempotencyKey);
    print(response);
} catch on DioException (e) {
    print('Exception when calling SocialApi->usersMuteCreate: $e\n');
}
```

### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **targetUserRequest** | [**TargetUserRequest**](TargetUserRequest.md)|  |
 **idempotencyKey** | **String**| Caller-generated replay key. Completed retries return the stored response. | [optional]

### Return type

[**RelationChange**](RelationChange.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
