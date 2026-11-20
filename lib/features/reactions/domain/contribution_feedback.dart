// ignore_for_file: public_member_api_docs

enum FeedbackTargetType { post, comment }

class FeedbackTarget {
  const FeedbackTarget(this.type, this.id);
  final FeedbackTargetType type;
  final String id;

  @override
  bool operator ==(Object other) =>
      other is FeedbackTarget &&
      other.type == type &&
      other.id.toLowerCase() == id.toLowerCase();
  @override
  int get hashCode => Object.hash(type, id.toLowerCase());
}

enum FeedbackChannel { quality, emotion }

enum QualityVote { like, dislike }

enum ContentEmotion { amused, sad, angry, surprised, appreciative }

class ContributionFeedbackSummary {
  const ContributionFeedbackSummary({
    required this.qualityCounts,
    required this.emotionCounts,
    this.myQuality,
    this.myEmotion,
  });

  final Map<QualityVote, int> qualityCounts;
  final Map<ContentEmotion, int> emotionCounts;
  final QualityVote? myQuality;
  final ContentEmotion? myEmotion;

  factory ContributionFeedbackSummary.fromJson(
    Map<String, dynamic> json,
    FeedbackTarget expected,
  ) {
    final target = json['target'];
    final quality = json['quality'];
    final emotion = json['emotion'];
    if (target is! Map ||
        target['type'] != expected.type.name ||
        target['id'] is! String ||
        (target['id'] as String).toLowerCase() != expected.id.toLowerCase() ||
        quality is! Map ||
        emotion is! Map ||
        !quality.containsKey('myValue') ||
        !emotion.containsKey('myValue')) {
      throw const FormatException('Feedback response does not match target');
    }
    Map<T, int> counts<T extends Enum>(dynamic value, List<T> allowed) {
      if (value is! Map) throw const FormatException('Missing feedback counts');
      return {
        for (final entry in allowed)
          entry: switch (value[entry.name]) {
            final int count when count >= 0 => count,
            _ => throw const FormatException('Invalid feedback count'),
          },
      };
    }

    T? selected<T extends Enum>(dynamic value, List<T> allowed) {
      if (value == null) return null;
      for (final entry in allowed) {
        if (value == entry.name) return entry;
      }
      throw const FormatException('Invalid feedback selection');
    }

    return ContributionFeedbackSummary(
      qualityCounts: counts(quality['counts'], QualityVote.values),
      emotionCounts: counts(emotion['counts'], ContentEmotion.values),
      myQuality: selected(quality['myValue'], QualityVote.values),
      myEmotion: selected(emotion['myValue'], ContentEmotion.values),
    );
  }
}
