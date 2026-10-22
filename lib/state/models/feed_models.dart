// ignore_for_file: public_member_api_docs

enum FeedType { discover, news, custom, moderation }

enum ContentType { text, image, video, mixed }

enum SortingRule { hot, newest, relevant, following, local }

class ContentFilters {
  final Set<ContentType> allowedTypes;
  const ContentFilters({required this.allowedTypes});

  bool allows(ContentType type) =>
      allowedTypes.contains(type) || allowedTypes.contains(ContentType.mixed);
}

class FeedRefinements {
  final List<String> includeKeywords;
  final List<String> excludeKeywords;
  final List<String> includeAccounts;
  final List<String> excludeAccounts;

  const FeedRefinements({
    this.includeKeywords = const [],
    this.excludeKeywords = const [],
    this.includeAccounts = const [],
    this.excludeAccounts = const [],
  });

  FeedRefinements copyWith({
    List<String>? includeKeywords,
    List<String>? excludeKeywords,
    List<String>? includeAccounts,
    List<String>? excludeAccounts,
  }) {
    return FeedRefinements(
      includeKeywords: includeKeywords ?? this.includeKeywords,
      excludeKeywords: excludeKeywords ?? this.excludeKeywords,
      includeAccounts: includeAccounts ?? this.includeAccounts,
      excludeAccounts: excludeAccounts ?? this.excludeAccounts,
    );
  }
}

class FeedModel {
  final String id;
  final String name;
  final FeedType type;
  final ContentFilters contentFilters;
  final SortingRule sorting;
  final FeedRefinements refinements;
  final int subscriptionLevelRequired;
  final bool isCustom;
  final bool isHome;

  const FeedModel({
    required this.id,
    required this.name,
    required this.type,
    required this.contentFilters,
    required this.sorting,
    required this.refinements,
    required this.subscriptionLevelRequired,
    this.isCustom = false,
    this.isHome = false,
  });

  FeedModel copyWith({
    String? id,
    String? name,
    FeedType? type,
    ContentFilters? contentFilters,
    SortingRule? sorting,
    FeedRefinements? refinements,
    int? subscriptionLevelRequired,
    bool? isCustom,
    bool? isHome,
  }) {
    return FeedModel(
      id: id ?? this.id,
      name: name ?? this.name,
      type: type ?? this.type,
      contentFilters: contentFilters ?? this.contentFilters,
      sorting: sorting ?? this.sorting,
      refinements: refinements ?? this.refinements,
      subscriptionLevelRequired:
          subscriptionLevelRequired ?? this.subscriptionLevelRequired,
      isCustom: isCustom ?? this.isCustom,
      isHome: isHome ?? this.isHome,
    );
  }
}

class FeedItem {
  final String id;
  final String feedId;
  final String author;
  final String? authorId;
  final String? sourceName;
  final String? sourceUrl;
  final ContentType contentType;
  final String title;
  final String body;
  final String? viewerReaction;
  final bool isPublication;
  final String? backingPostId;
  String? get interactionPostId => isPublication ? backingPostId : id;
  final String? imageUrl;
  final String? videoThumbnailUrl;
  final List<String> tags;
  final DateTime publishedAt;
  final bool isNews;
  final bool isPinned;
  final FeedTrustSummary trustSummary;
  final String authorshipLabel;
  final String classificationSource;
  final String classificationState;

  const FeedItem({
    required this.id,
    required this.feedId,
    required this.author,
    this.authorId,
    this.sourceName,
    this.sourceUrl,
    required this.contentType,
    required this.title,
    required this.body,
    this.viewerReaction,
    this.isPublication = false,
    this.backingPostId,
    required this.publishedAt,
    this.imageUrl,
    this.videoThumbnailUrl,
    this.tags = const [],
    this.isNews = false,
    this.isPinned = false,
    this.trustSummary = const FeedTrustSummary(),
    this.authorshipLabel = 'Under review',
    this.classificationSource = 'automated_classification',
    this.classificationState = 'unavailable',
  });
}

class FeedTrustSummary {
  final String trustStatus;
  final FeedTrustTimeline timeline;
  final bool hasAppeal;
  final bool proofSignalsProvided;
  final bool verifiedContextBadgeEligible;
  final bool featuredEligible;

  const FeedTrustSummary({
    this.trustStatus = 'no_extra_signals',
    this.timeline = const FeedTrustTimeline(),
    this.hasAppeal = false,
    this.proofSignalsProvided = false,
    this.verifiedContextBadgeEligible = false,
    this.featuredEligible = false,
  });
}

class FeedTrustTimeline {
  final String created;
  final String mediaChecked;
  final String moderation;
  final String? appeal;

  const FeedTrustTimeline({
    this.created = 'complete',
    this.mediaChecked = 'none',
    this.moderation = 'none',
    this.appeal,
  });
}

class CustomFeedDraft {
  final ContentType contentType;
  final SortingRule sorting;
  final FeedRefinements refinements;
  final String name;
  final bool setAsHome;

  const CustomFeedDraft({
    this.contentType = ContentType.mixed,
    this.sorting = SortingRule.relevant,
    this.refinements = const FeedRefinements(),
    this.name = '',
    this.setAsHome = false,
  });

  CustomFeedDraft copyWith({
    ContentType? contentType,
    SortingRule? sorting,
    FeedRefinements? refinements,
    String? name,
    bool? setAsHome,
  }) {
    return CustomFeedDraft(
      contentType: contentType ?? this.contentType,
      sorting: sorting ?? this.sorting,
      refinements: refinements ?? this.refinements,
      name: name ?? this.name,
      setAsHome: setAsHome ?? this.setAsHome,
    );
  }
}
