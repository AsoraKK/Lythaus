import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const stagingDomain = String.fromEnvironment('STAGING_DOMAIN');
  const stagingToken = String.fromEnvironment('STAGING_SMOKE_TOKEN');
  final canRun = stagingDomain.isNotEmpty && stagingToken.isNotEmpty;

  group('Privacy staging flow', () {
    testWidgets('export enforces cooldown and delete succeeds', (tester) async {
      if (!canRun) {
        debugPrint('Skipping privacy flow test - staging env not configured.');
        return;
      }

      final dio = Dio(BaseOptions(baseUrl: stagingDomain));
      final logger = AppLogger('privacy_e2e');
      final api = DioPrivacyApi(dio: dio, logger: logger);

      final exportResult = await api.requestExport(authToken: stagingToken);
      expect(exportResult.acceptedAt, isNotNull);

      await expectLater(
        () => api.requestExport(authToken: stagingToken),
        throwsA(
          isA<PrivacyApiException>().having(
            (error) => error.type,
            'type',
            PrivacyErrorType.rateLimited,
          ),
        ),
      );

      await api.deleteAccount(authToken: stagingToken, hardDelete: true);
    });
  });
}
