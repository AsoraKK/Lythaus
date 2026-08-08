import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:asn1lib/asn1lib.dart';
import 'package:lythaus/core/security/spki_utils.dart';
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
  test('extractSpkiBytes returns SPKI sequence bytes', () {
    final spki = ASN1Sequence()
      ..add(ASN1Integer(BigInt.from(100)))
      ..add(ASN1Integer(BigInt.from(200)));
    final bytes = _buildCertificateBytes(spki);

    final cert = MockX509Certificate();
    when(() => cert.der).thenReturn(bytes);

    final result = extractSpkiBytes(cert);
    expect(result, Uint8List.fromList(spki.encodedBytes));
  });

  test('computeSpkiSha256Base64 hashes SPKI bytes', () {
    final spki = ASN1Sequence()
      ..add(ASN1Integer(BigInt.from(42)))
      ..add(ASN1Integer(BigInt.from(7)));
    final bytes = _buildCertificateBytes(spki);
    final cert = MockX509Certificate();
    when(() => cert.der).thenReturn(bytes);

    final expected = base64.encode(sha256.convert(spki.encodedBytes).bytes);
    expect(computeSpkiSha256Base64(cert), expected);
  });

  test('extractSpkiBytes throws on invalid certificate structure', () {
    final cert = MockX509Certificate();
    final invalid = ASN1Integer(BigInt.from(123));
    when(() => cert.der).thenReturn(Uint8List.fromList(invalid.encodedBytes));

    expect(() => extractSpkiBytes(cert), throwsStateError);
  });

  test('extractSpkiBytes throws when SPKI is missing', () {
    final spki = ASN1Sequence()..add(ASN1Integer(BigInt.from(1)));
    final bytes = _buildCertificateBytes(spki, includeSpki: false);
    final cert = MockX509Certificate();
    when(() => cert.der).thenReturn(bytes);

    expect(() => extractSpkiBytes(cert), throwsStateError);
  });
}
