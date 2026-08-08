import 'package:lythaus/core/security/device_integrity.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('flutter_jailbreak_detection');

  final defaultMessenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  group('DeviceIntegrityService', () {
    late DeviceIntegrityService service;
    late List<MethodCall> calls;

    setUp(() {
      calls = [];
      defaultMessenger.setMockMethodCallHandler(channel, (
        MethodCall call,
      ) async {
        calls.add(call);
        switch (call.method) {
          case 'jailbroken':
            return false;
          case 'developerMode':
            return false;
          case 'onExternalStorage':
            return false;
          default:
            return null;
        }
      });

      service = DeviceIntegrityService();
    });

    tearDown(() {
      defaultMessenger.setMockMethodCallHandler(channel, null);
    });

    test('memoizes check results', () async {
      final first = await service.checkIntegrity();
      final second = await service.checkIntegrity();

      final jailbrokenCalls = calls
          .where((c) => c.method == 'jailbroken')
          .length;

      expect(identical(first, second), isTrue);
      expect(jailbrokenCalls, 1);
    });

    test('detects compromised devices and logs telemetry', () async {
      String? logMessage;
      final originalDebugPrint = debugPrint;
      debugPrint = (String? message, {int? wrapWidth}) {
        logMessage = message;
      };

      defaultMessenger.setMockMethodCallHandler(channel, (
        MethodCall call,
      ) async {
        calls.add(call);
        if (call.method == 'jailbroken') {
          return true;
        }
        return false;
      });

      final info = await service.checkIntegrity();

      expect(info.status, DeviceIntegrityStatus.compromised);
      expect(info.allowPosting, isFalse);
      expect(logMessage, contains('device_integrity_violation'));

      debugPrint = originalDebugPrint;
    });

    test('falls back to error on logging failure', () async {
      final originalDebugPrint = debugPrint;
      debugPrint = (String? message, {int? wrapWidth}) {
        throw Exception('log failure');
      };

      defaultMessenger.setMockMethodCallHandler(channel, (
        MethodCall call,
      ) async {
        if (call.method == 'jailbroken') {
          return true;
        }
        return false;
      });

      final info = await service.checkIntegrity();

      expect(info.status, DeviceIntegrityStatus.error);
      expect(info.allowPosting, isTrue);
      expect(info.allowReading, isTrue);

      debugPrint = originalDebugPrint;
    });
  });
}
