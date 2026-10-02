import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/state/models/feed_models.dart';

/// Projects post metadata without deciding publication or view eligibility.
FeedItem mapPostToFeedItem(
  domain.Post post, {
  required String feedId,
  required String fallbackTitle,
}) {
  final hasMedia = post.mediaUrls?.isNotEmpty ?? false;
  return FeedItem(
    id: post.id,
    feedId: feedId,
    author: post.authorUsername,
    authorId: post.authorId,
    sourceName: post.source?.name,
    sourceUrl: post.source?.url,
    contentType: hasMedia ? ContentType.image : ContentType.text,
    title: post.metadata?.category ?? fallbackTitle,
    body: post.text,
    imageUrl: hasMedia ? post.mediaUrls!.first : null,
    publishedAt: post.createdAt,
    tags: post.metadata?.tags ?? const [],
    isNews: post.isNews,
    isPinned: post.metadata?.isPinned ?? false,
    trustSummary: FeedTrustSummary(
      trustStatus: post.trustStatus,
      timeline: FeedTrustTimeline(
        created: post.timeline.created,
        mediaChecked: post.timeline.mediaChecked,
        moderation: post.timeline.moderation,
        appeal: post.timeline.appeal,
      ),
      hasAppeal: post.hasAppeal,
      proofSignalsProvided: post.proofSignalsProvided,
      verifiedContextBadgeEligible: post.verifiedContextBadgeEligible,
      featuredEligible: post.featuredEligible,
    ),
    authorshipLabel: post.authorship.label.label,
    classificationSource: post.authorship.classificationSource,
  );
}
