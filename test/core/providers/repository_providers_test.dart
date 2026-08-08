import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/features/feed/domain/feed_repository.dart';

void main() {
  group('Repository Providers', () {
    late ProviderContainer container;

    setUp(() {
      container = ProviderContainer();
    });

    tearDown(() {
      container.dispose();
    });

    test(
      'httpClientProvider provides Dio instance with correct configuration',
      () {
        final dio = container.read(httpClientProvider);
        final expectedBaseUrl = EnvironmentConfig.fromEnvironment().apiBaseUrl;

        expect(dio, isNotNull);
        expect(dio.options.baseUrl, expectedBaseUrl);
        expect(dio.options.connectTimeout, const Duration(seconds: 10));
        expect(dio.options.receiveTimeout, const Duration(seconds: 10));
        expect(dio.options.headers['Content-Type'], 'application/json');
        expect(dio.options.headers['Accept'], 'application/json');
      },
    );

    test('moderationRepositoryProvider provides ModerationRepository', () {
      final repo = container.read(moderationRepositoryProvider);

      expect(repo, isA<ModerationRepository>());
    });

    test('feedRepositoryProvider provides FeedRepository', () {
      final repo = container.read(feedRepositoryProvider);

      expect(repo, isA<FeedRepository>());
    });
  });
}
