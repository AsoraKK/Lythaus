# lythaus_api_client.model.SubscriptionStatusEntitlements

## Load the model package
```dart
import 'package:lythaus_api_client/api.dart';
```

## Properties
Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**dailyPosts** | **int** |  |
**dailyComments** | **int** |  |
**dailyReactions** | **int** |  |
**dailyAppeals** | **int** |  |
**exportCooldownDays** | **int** |  |
**maxMediaSizeMB** | **int** |  |
**maxMediaPerPost** | **int** |  |
**maxCustomFeeds** | **int** | Maximum custom feeds available to this tier. |
**newsBoardAccessLevel** | **String** | Free receives preview; Premium and Black receive full access. |
**newsBoardPreview** | **bool** | Whether the tier can read the safe News Board preview. |
**postingRestricted** | **bool** | Whether normal posting is product-limited beyond abuse controls. |
**rewardLevelCap** | **int** | Highest reputation reward level available to this tier. |
**rewardOptionsPerLevel** | **int** | Reward options per reputation level; null means all eligible rewards. |
**rewardChoiceBreadth** | **String** |  |

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
