import 'package:lythaus_api_client/lythaus_api_client.dart';
import 'package:built_value/serializer.dart';
import 'package:test/test.dart';

void main() {
  test('401 error response serializes the active fields', () {
    final wire = <String, Object?>{
      'error': 'unauthorized',
      'correlationId': 'membership-request-401',
    };
    final response = standardSerializers.deserializeWith(
      SubscriptionStatus401Response.serializer,
      wire,
    )!;

    expect(response.error, 'unauthorized');
    expect(response.correlationId, 'membership-request-401');
    expect(
      standardSerializers.serializeWith(
        SubscriptionStatus401Response.serializer,
        response,
      ),
      wire,
    );
  });

  test('401 error response rejects missing or malformed required fields', () {
    expect(
      () => standardSerializers.deserializeWith(
        SubscriptionStatus401Response.serializer,
        {'error': 'unauthorized'},
      ),
      throwsA(isA<DeserializationError>()),
    );
    expect(
      () => standardSerializers.deserializeWith(
        SubscriptionStatus401Response.serializer,
        {'error': false, 'correlationId': 'membership-request-401'},
      ),
      throwsA(isA<DeserializationError>()),
    );
  });
}
