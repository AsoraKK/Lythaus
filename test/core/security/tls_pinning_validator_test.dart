import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:asn1lib/asn1lib.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/security/tls_pinning.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockX509Certificate extends Mock implements X509Certificate {}

Uint8List _buildCertificateBytes(ASN1Sequence spki, {bool includeSpki = true}) {
  final tbs = ASN1Sequence();
  tbs.add(ASN1Integer(BigInt.from(1)));
  tbs.add(ASN1Integer(BigInt.from(2)));
  tbs.add(ASN1Null());
  tbs.add(ASN1Null());
  tbs.add(ASN1Null());
  if (includeSpki) {
    tbs.add(spki);
  }

  final cert = ASN1Sequence();
  cert.add(tbs);
  cert.add(ASN1Null());
  cert.add(ASN1BitString(Uint8List.fromList([0x00])));

  return Uint8List.fromList(cert.encodedBytes);
}

void main() {
  test('pinning disabled allows connection', () {
    final validator = TlsPinningValidator(
      config: const TlsPinConfig(
        enabled: false,
        strictMode: true,
        spkiPinsBase64: ['pin'],
      ),
      environment: Environment.development,
    );

    final cert = MockX509Certificate();
    when(() => cert.der).thenReturn(Uint8List(0));

    expect(validator.validateCertificateChain(cert, 'example.com'), isTrue);
  });

  test('no pins configured allows connection', () {
    final validator = TlsPinningValidator(
      config: const TlsPinConfig(
        enabled: true,
        strictMode: true,
        spkiPinsBase64: [],
      ),
      environment: Environment.development,
    );

    final cert = MockX509Certificate();
    when(() => cert.der).thenReturn(Uint8List(0));

    expect(validator.validateCertificateChain(cert, 'example.com'), isTrue);
  });

  test('pin match succeeds', () {
    final spki = ASN1Sequence()..add(ASN1Integer(BigInt.from(7)));
    final cert = MockX509Certificate();
    when(() => cert.der).thenReturn(_buildCertificateBytes(spki));

    final pin = base64.encode(sha256.convert(spki.encodedBytes).bytes);
    final validator = TlsPinningValidator(
      config: TlsPinConfig(
        enabled: true,
        strictMode: true,
        spkiPinsBase64: [pin],
      ),
      environment: Environment.development,
    );

    expect(validator.validateCertificateChain(cert, 'example.com'), isTrue);
  });

  test('pin mismatch blocks in strict mode', () {
    final spki = ASN1Sequence()..add(ASN1Integer(BigInt.from(7)));
    final cert = MockX509Certificate();
    when(() => cert.der).thenReturn(_buildCertificateBytes(spki));

    final validator = TlsPinningValidator(
      config: const TlsPinConfig(
        enabled: true,
        strictMode: true,
        spkiPinsBase64: ['invalid'],
      ),
      environment: Environment.development,
    );

    expect(validator.validateCertificateChain(cert, 'example.com'), isFalse);
  });

  test('pin mismatch allows in warn-only mode', () {
    final spki = ASN1Sequence()..add(ASN1Integer(BigInt.from(7)));
    final cert = MockX509Certificate();
    when(() => cert.der).thenReturn(_buildCertificateBytes(spki));

    final validator = TlsPinningValidator(
      config: const TlsPinConfig(
        enabled: true,
        strictMode: false,
        spkiPinsBase64: ['invalid'],
      ),
      environment: Environment.development,
    );

    expect(validator.validateCertificateChain(cert, 'example.com'), isTrue);
  });

  test('validation errors respect strict mode', () {
    final invalidCert = MockX509Certificate();
    when(() => invalidCert.der).thenReturn(Uint8List.fromList([0x02, 0x01]));

    final strictValidator = TlsPinningValidator(
      config: const TlsPinConfig(
        enabled: true,
        strictMode: true,
        spkiPinsBase64: ['pin'],
      ),
      environment: Environment.development,
    );
    final warnValidator = TlsPinningValidator(
      config: const TlsPinConfig(
        enabled: true,
        strictMode: false,
        spkiPinsBase64: ['pin'],
      ),
      environment: Environment.development,
    );

    expect(
      strictValidator.validateCertificateChain(invalidCert, 'host'),
      isFalse,
    );
    expect(warnValidator.validateCertificateChain(invalidCert, 'host'), isTrue);
  });
}
