import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/security/cert_pinning.dart' as cp;

void main() {
  group('Certificate pinning pins', () {
    test('no placeholders and valid format', () {
      const pinsMap = cp.kPinnedDomains;

      if (!cp.kEnableCertPinning) {
        expect(
          pinsMap,
          isEmpty,
          reason:
              'The MVP pinning deviation must not ship dormant or placeholder pins.',
        );
        return;
      }

      // Must have at least one host configured
      expect(
        pinsMap.isNotEmpty,
        true,
        reason: 'No hosts configured for pinning',
      );

      final pinPattern = RegExp(r'^[A-Za-z0-9+/=]{43,44}$');

      for (final entry in pinsMap.entries) {
        final host = entry.key;
        final pins = entry.value;

        // Each host must have at least two pins (primary + backup)
        expect(
          pins.length >= 2,
          true,
          reason: 'Host $host must have at least two pins',
        );

        for (final p in pins) {
          expect(p.isNotEmpty, true, reason: 'Empty pin for host $host');
          expect(
            p.contains('REPLACE_WITH_SPKI_PIN'),
            false,
            reason: 'Placeholder found in pin for host $host',
          );
          expect(
            p.toUpperCase().contains('PLACEHOLDER') ||
                p.toUpperCase().contains('YOUR_SPKI_PIN_HERE') ||
                p.toUpperCase().contains('TODO'),
            false,
            reason: 'Generic placeholder token found in pin for host $host',
          );
          expect(
            pinPattern.hasMatch(p),
            true,
            reason: 'Pin base64 format invalid for host $host',
          );
        }
      }
    });
  });
}
