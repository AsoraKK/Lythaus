# lythaus_api_client.model.PostView

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **String** |  |
**authorId** | **String** |  |
**content** | **String** |  |
**contentType** | **String** |  |
**mediaUrls** | **BuiltList&lt;String&gt;** |  | [optional]
**topics** | **BuiltList&lt;String&gt;** |  | [optional]
**visibility** | **String** |  |
**isNews** | **bool** |  |
**source_** | [**NewsSourceMetadata**](NewsSourceMetadata.md) |  | [optional]
**clusterId** | **String** |  | [optional]
**authorship** | [**PublicAuthorship**](PublicAuthorship.md) |  |
**createdAt** | [**DateTime**](DateTime.md) |  |
**updatedAt** | [**DateTime**](DateTime.md) |  |
**author** | [**BuiltMap&lt;String, JsonObject&gt;**](JsonObject.md) |  |
**authorRole** | **String** |  |
**likeCount** | **int** |  |
**commentCount** | **int** |  |
**bookmarkCount** | **int** |  | [optional]
**viewCount** | **int** |  | [optional]
**viewerHasLiked** | **bool** |  | [optional]
**viewerHasBookmarked** | **bool** |  | [optional]
**viewerFollowsAuthor** | **bool** |  | [optional]
**authorFollowerCount** | **int** |  | [optional]
**recentComments** | [**BuiltList&lt;PostViewAllOfRecentComments&gt;**](PostViewAllOfRecentComments.md) |  | [optional]
**badges** | **BuiltList&lt;String&gt;** |  | [optional]
**trustStatus** | **String** |  |
**timeline** | [**PostTrustTimeline**](PostTrustTimeline.md) |  |
**hasAppeal** | **bool** |  |
**proofSignalsProvided** | **bool** |  |
**verifiedContextBadgeEligible** | **bool** |  |
**featuredEligible** | **bool** |  |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
