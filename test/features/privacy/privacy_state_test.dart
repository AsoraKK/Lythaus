import 'package:lythaus/features/privacy/state/privacy_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PrivacyState', () {
    test('unknown state cannot authorize export', () {
      const state = PrivacyState();
      expect(state.canRequestExport, isFalse);
    });

    test('canRequestExport true after failure when cooldown elapsed', () {
      const state = PrivacyState(
        exportStatus: ExportStatus.failed,
        remainingCooldown: Duration.zero,
        exportAllowed: true,
      );
      expect(state.canRequestExport, isTrue);
    });

    test('isCoolingDown true only when status and duration match', () {
      const cooling = PrivacyState(
        exportStatus: ExportStatus.coolingDown,
        remainingCooldown: Duration(minutes: 10),
      );
      expect(cooling.isCoolingDown, isTrue);

      const idle = PrivacyState(
        exportStatus: ExportStatus.coolingDown,
        remainingCooldown: Duration.zero,
      );
      expect(idle.isCoolingDown, isFalse);
    });

    test('copyWith clearError resets error message', () {
      const state = PrivacyState(
        error: 'oops',
        exportStatus: ExportStatus.failed,
      );

      final next = state.copyWith(clearError: true);
      expect(next.error, isNull);
      expect(next.exportStatus, ExportStatus.failed);
    });
  });
}
