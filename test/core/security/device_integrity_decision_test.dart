// ignore_for_file: public_member_api_docs

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/error/error_codes.dart';

void main() {
  // ── DeviceIntegrityDecision factories ─────────────────────────────────
  group('DeviceIntegrityDecision.allow', () {
    test('allow returns correct decision', () {
      final d = DeviceIntegrityDecision.allow();
      expect(d.allow, isTrue);
      expect(d.showBlockingUi, isFalse);
      expect(d.messageKey, isNull);
      expect(d.errorCode, isNull);
      expect(d.warnOnly, isFalse);
    });
  });

  group('DeviceIntegrityDecision.warnOnly', () {
    test('warnOnly returns correct decision', () {
      final d = DeviceIntegrityDecision.warnOnly('security.warn');
      expect(d.allow, isTrue);
      expect(d.showBlockingUi, isFalse);
      expect(d.messageKey, 'security.warn');
      expect(d.warnOnly, isTrue);
    });
  });

  group('DeviceIntegrityDecision.block', () {
    test('block returns correct decision', () {
      final d = DeviceIntegrityDecision.block('security.blocked');
      expect(d.allow, isFalse);
      expect(d.showBlockingUi, isTrue);
      expect(d.messageKey, 'security.blocked');
      expect(d.errorCode, ErrorCodes.deviceIntegrityBlocked);
      expect(d.warnOnly, isFalse);
    });
  });

  group('DeviceIntegrityDecision constructor', () {
    test('custom values', () {
      const d = DeviceIntegrityDecision(
        allow: false,
        showBlockingUi: true,
        messageKey: 'msg',
        errorCode: 'ERR',
        warnOnly: true,
      );
      expect(d.allow, isFalse);
      expect(d.showBlockingUi, isTrue);
      expect(d.messageKey, 'msg');
      expect(d.errorCode, 'ERR');
      expect(d.warnOnly, isTrue);
    });

    test('warnOnly defaults to false', () {
      const d = DeviceIntegrityDecision(allow: true, showBlockingUi: false);
      expect(d.warnOnly, isFalse);
    });
  });

  // ── isDeviceIntegrityBlockedCode ──────────────────────────────────────
  group('isDeviceIntegrityBlockedCode', () {
    test('returns true for matching code', () {
      expect(
        isDeviceIntegrityBlockedCode(ErrorCodes.deviceIntegrityBlocked),
        isTrue,
      );
    });

    test('returns false for null', () {
      expect(isDeviceIntegrityBlockedCode(null), isFalse);
    });

    test('returns false for different code', () {
      expect(isDeviceIntegrityBlockedCode('OTHER_CODE'), isFalse);
    });

    test('returns false for empty string', () {
      expect(isDeviceIntegrityBlockedCode(''), isFalse);
    });
  });

  // ── IntegrityUseCase ──────────────────────────────────────────────────
  group('IntegrityUseCase', () {
    test('has all expected values', () {
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.signIn));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.signUp));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.postContent));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.comment));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.like));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.flag));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.appeal));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.uploadMedia));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.privacyDsr));
      expect(IntegrityUseCase.values, contains(IntegrityUseCase.readFeed));
    });

    test('name returns correct string', () {
      expect(IntegrityUseCase.signIn.name, 'signIn');
      expect(IntegrityUseCase.postContent.name, 'postContent');
      expect(IntegrityUseCase.readFeed.name, 'readFeed');
    });
  });
}
