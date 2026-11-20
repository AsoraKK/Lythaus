import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/reactions/application/contribution_feedback_controller.dart';
import 'package:lythaus/features/reactions/domain/contribution_feedback.dart';
import 'package:lythaus/features/reactions/presentation/contribution_feedback_controls.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/components/reading_pane.dart';

import '../helpers/content_recovery.dart';
import '../helpers/feed_session.dart';

class _FixtureFeedback extends ContributionFeedbackService {
  _FixtureFeedback() : super(Dio());
  final _values = <FeedbackTarget, Map<FeedbackChannel, String?>>{};

  @override
  Future<ContributionFeedbackSummary> read(
    FeedbackTarget target,
    String? token,
  ) async {
    final row = _values[target] ?? {};
    return ContributionFeedbackSummary(
      qualityCounts: {
        for (final vote in QualityVote.values)
          vote: row[FeedbackChannel.quality] == vote.name ? 1 : 0,
      },
      emotionCounts: {
        for (final emotion in ContentEmotion.values)
          emotion: row[FeedbackChannel.emotion] == emotion.name ? 1 : 0,
      },
      myQuality: QualityVote.values
          .where((vote) => vote.name == row[FeedbackChannel.quality])
          .firstOrNull,
      myEmotion: ContentEmotion.values
          .where((emotion) => emotion.name == row[FeedbackChannel.emotion])
          .firstOrNull,
    );
  }

  @override
  Future<void> change(
    FeedbackTarget target,
    FeedbackChannel channel,
    String? value,
    String token,
    String key,
  ) async {
    (_values[target] ??= {})[channel] = value;
  }
}

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;
  runApp(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWith(
          (ref) => FeedTestAuth(feedTestUser('reader')),
        ),
        jwtProvider.overrideWith((ref) async => 'reader'),
        contentRecoveryStorageProvider.overrideWithValue(
          MemoryContentRecoveryStorage(),
        ),
        contributionFeedbackCandidateProvider.overrideWithValue(true),
        contributionFeedbackServiceProvider.overrideWithValue(
          _FixtureFeedback(),
        ),
      ],
      child: MaterialApp(
        title: 'Lythaus feedback synthetic preview',
        debugShowCheckedModeBanner: false,
        theme: LythausTheme.dark(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(
              double.tryParse(Uri.base.queryParameters['scale'] ?? '') ?? 1,
            ),
            disableAnimations: true,
          ),
          child: child!,
        ),
        home: ReadingPane(
          child: Scaffold(
            appBar: AppBar(title: const Text('Discovery')),
            body: ListView(
              children: [
                FeedCard(
                  onTap: () {},
                  item: FeedItem(
                    id: 'post-a',
                    feedId: 'discover',
                    author: 'Maya',
                    authorId: 'author',
                    contentType: ContentType.text,
                    authorshipLabel: 'Human-authored',
                    classificationSource: 'user_disclosure',
                    title: 'A closer look at the river',
                    body:
                        'A careful report about the people and places affected by recent flooding.',
                    publishedAt: DateTime.utc(2026, 10, 28),
                  ),
                  actions: const ContributionFeedbackControls(
                    target: FeedbackTarget(FeedbackTargetType.post, 'post-a'),
                    authorId: 'author',
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(34, 8, 16, 16),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color:
                          LythausTheme.dark().colorScheme.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Padding(
                      padding: EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Jordan',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Thank you for including the local context and sources.',
                          ),
                          ContributionFeedbackControls(
                            target: FeedbackTarget(
                              FeedbackTargetType.comment,
                              'comment-a',
                            ),
                            authorId: 'other',
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
