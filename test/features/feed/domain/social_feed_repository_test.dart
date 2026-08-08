import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('SocialFeedException toString includes message', () {
    const exception = SocialFeedException('feed failed', code: 'E_FEED');
    expect(exception.toString(), 'SocialFeedException: feed failed');
  });

  test('SocialFeedMetrics.fromJson parses values and defaults', () {
    final metrics = SocialFeedMetrics.fromJson({
      'totalPosts': 120,
      'totalActiveUsers': 55,
      'postsToday': 7,
      'averageEngagement': 1.25,
      'topCategories': {'news': 3},
      'trendingTags': ['lythaus'],
    });

    expect(metrics.totalPosts, 120);
    expect(metrics.totalActiveUsers, 55);
    expect(metrics.postsToday, 7);
    expect(metrics.averageEngagement, 1.25);
    expect(metrics.topCategories['news'], 3);
    expect(metrics.trendingTags, ['lythaus']);

    final defaults = SocialFeedMetrics.fromJson({});
    expect(defaults.totalPosts, 0);
    expect(defaults.totalActiveUsers, 0);
    expect(defaults.postsToday, 0);
    expect(defaults.averageEngagement, 0.0);
    expect(defaults.topCategories, isEmpty);
    expect(defaults.trendingTags, isEmpty);
  });
}
