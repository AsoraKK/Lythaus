import 'package:lythaus_api_client/lythaus_api_client.dart';
import 'package:built_value/serializer.dart';
import 'package:test/test.dart';

void main() {
  test('500 error response round-trips request_failed and correlation id', () {
    final wire = <String, Object?>{
      'error': 'request_failed',
      'correlationId': 'membership-request-500',
    };
    final response = standardSerializers.deserializeWith(
      SubscriptionStatus500Response.serializer,
      wire,
    )!;

    expect(
      response.error,
      SubscriptionStatus500ResponseErrorEnum.requestFailed,
    );
    expect(response.correlationId, 'membership-request-500');
    expect(
      standardSerializers.serializeWith(
        SubscriptionStatus500Response.serializer,
        response,
      ),
      wire,
    );
  });

  test('500 error response rejects unknown enums and missing fields', () {
    expect(
      () => standardSerializers.deserializeWith(
        SubscriptionStatus500Response.serializer,
        {
          'error': 'provider_unavailable',
          'correlationId': 'membership-request'
        },
      ),
      throwsA(isA<DeserializationError>()),
    );
    expect(
      () => standardSerializers.deserializeWith(
        SubscriptionStatus500Response.serializer,
        {'error': 'request_failed'},
      ),
      throwsA(isA<DeserializationError>()),
    );
  });
}
