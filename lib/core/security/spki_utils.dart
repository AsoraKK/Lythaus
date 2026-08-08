// ignore_for_file: public_member_api_docs

/// LYTHAUS SPKI UTILITIES
///
/// 🎯 Purpose: Extract and hash SPKI from X509 certificates
/// 🔐 Security: Supports TLS pinning with SPKI SHA-256 hashes
library;

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:asn1lib/asn1lib.dart';
import 'package:crypto/crypto.dart';

Uint8List extractSpkiBytes(X509Certificate cert) {
  final parser = ASN1Parser(cert.der);
  final certSeq = parser.nextObject();
  if (certSeq is! ASN1Sequence || certSeq.elements.isEmpty) {
    throw StateError('Invalid X509 certificate structure');
  }

  final tbs = certSeq.elements.first;
  if (tbs is! ASN1Sequence || tbs.elements.length < 6) {
    throw StateError('Invalid TBSCertificate structure');
  }

  // Account for optional [0] EXPLICIT version field.
  // Check if first element is a tagged object (ASN1 context-specific tag)
  final firstElement = tbs.elements.first;
  final hasVersionTag = firstElement.runtimeType.toString().contains('Tagged');
  final spkiIndex = hasVersionTag ? 6 : 5;

  if (tbs.elements.length <= spkiIndex) {
    throw StateError('SubjectPublicKeyInfo not found in certificate');
  }

  final spki = tbs.elements[spkiIndex];
  if (spki is! ASN1Sequence) {
    throw StateError('SubjectPublicKeyInfo is not a sequence');
  }

  return Uint8List.fromList(spki.encodedBytes);
}

String computeSpkiSha256Base64(X509Certificate cert) {
  final spkiBytes = extractSpkiBytes(cert);
  final digest = sha256.convert(spkiBytes);
  return base64.encode(digest.bytes);
}
