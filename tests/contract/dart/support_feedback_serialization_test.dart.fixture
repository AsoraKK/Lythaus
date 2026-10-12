import 'package:built_value/serializer.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';
import 'package:test/test.dart';

void main() {
  const bytes = <String, Object>{
    'titleBytes': 1024,
    'detailBytes': 8192,
    'stepsBytes': 8192,
    'contextBytes': 512,
    'memberMessageBytes': 8192,
  };
  const characters = <String, Object>{
    'titleCharacters': 160,
    'detailCharacters': 2000,
    'stepsCharacters': 2000,
    'memberMessageCharacters': 2000,
  };
  for (final includeCharacters in [false, true]) {
    test(
      'support policy preserves byte bounds and optional character bounds $includeCharacters',
      () {
        final wire = <String, Object>{
          ...bytes,
          if (includeCharacters) ...characters,
        };
        final decoded = standardSerializers.deserializeWith(
          SupportFeedbackPolicyLimits.serializer,
          wire,
        )!;
        expect(decoded.titleBytes, 1024);
        expect(decoded.titleCharacters, includeCharacters ? 160 : null);
        expect(
          decoded.memberMessageCharacters,
          includeCharacters ? 2000 : null,
        );
        expect(
          standardSerializers.serializeWith(
            SupportFeedbackPolicyLimits.serializer,
            decoded,
          ),
          wire,
        );
      },
    );
  }

  void requestCases<T>(
    String label,
    String kind,
    bool owner,
    Serializer<T> serializer,
  ) {
    for (final closed in <bool?>[null, false, true]) {
      test(
        '$label preserves legacy, open and closed request state $closed',
        () {
          final wire = <String, Object>{
            'id': '018f0000-0000-7000-8000-000000000001',
            'kind': kind,
            'category': kind == 'problem' ? 'display' : 'navigation',
            'title': 'Synthetic support contract',
            if (kind == 'problem') ...{
              'actual': 'Synthetic actual',
              'expected': 'Synthetic expected',
            } else ...{
              'improvement': 'Synthetic improvement',
              'benefit': 'Synthetic benefit',
            },
            'revision': 3,
            'state': closed == true
                ? (kind == 'problem' ? 'resolved' : 'accepted')
                : 'received',
            'createdAt': '2026-10-07T10:00:00.000Z',
            'updatedAt': '2026-10-07T10:01:00.000Z',
            'memberMessage': 'Synthetic private support reply',
            if (closed != null) 'closed': closed,
            if (owner) 'submitterId': '018f0000-0000-7000-8000-000000000002',
          };
          final decoded = standardSerializers.deserializeWith(
            serializer,
            wire,
          )!;
          final encoded =
              standardSerializers.serializeWith(serializer, decoded) as Map;
          expect(encoded, wire);
          expect(encoded.containsKey('closed'), closed != null);
          expect(encoded.containsKey('submitterId'), owner);
          expect(encoded.containsKey('private'), isFalse);
        },
      );
    }
  }

  requestCases(
    'member problem',
    'problem',
    false,
    MemberProblemRequest.serializer,
  );
  requestCases(
    'member suggestion',
    'suggestion',
    false,
    MemberSuggestionRequest.serializer,
  );
  requestCases(
    'owner problem',
    'problem',
    true,
    OwnerProblemRequest.serializer,
  );
  requestCases(
    'owner suggestion',
    'suggestion',
    true,
    OwnerSuggestionRequest.serializer,
  );
  requestCases(
    'member problem union',
    'problem',
    false,
    MemberSupportRequest.serializer,
  );
  requestCases(
    'member suggestion union',
    'suggestion',
    false,
    MemberSupportRequest.serializer,
  );
  requestCases(
    'owner problem union',
    'problem',
    true,
    OwnerSupportRequest.serializer,
  );
  requestCases(
    'owner suggestion union',
    'suggestion',
    true,
    OwnerSupportRequest.serializer,
  );
}
