import 'package:lythaus_api_client/lythaus_api_client.dart';
import 'package:test/test.dart';

void main() {
  test('private presentation update retains booleans and expected version', () {
    final wire = <String, Object?>{
      'presentationPreferences': {
        'leftHandedMode': true,
        'horizontalSwipeEnabled': false,
        'expectedVersion': 7,
      },
    };
    final decoded = standardSerializers.deserializeWith(
      ProductIntegrityProfileUpdateRequest.serializer,
      wire,
    )!;
    expect(decoded.presentationPreferences!.leftHandedMode, isTrue);
    expect(decoded.presentationPreferences!.horizontalSwipeEnabled, isFalse);
    expect(decoded.presentationPreferences!.expectedVersion, 7);
    expect(
      standardSerializers.serializeWith(
        ProductIntegrityProfileUpdateRequest.serializer,
        decoded,
      ),
      wire,
    );
  });

  for (final preferences in [
    null,
    {'leftHandedMode': true, 'horizontalSwipeEnabled': false, 'version': 8},
  ]) {
    test(
      'owner preference model accepts nullable storage and versioned values $preferences',
      () {
        final wire = <String, Object?>{
          'user': {
            'id': '0192c000-0000-7000-8000-000000000001',
            'displayName': 'Synthetic member',
            'reputationLevel': 0,
            'trustPassportVisibility': 'public_minimal',
            'subscriptionTier': 'free',
            'accountabilityIdentityDeclared': false,
            'moderationState': 'allowed',
            'publicVisibility': true,
            'presentationPreferences': preferences,
          },
        };
        final decoded = standardSerializers.deserializeWith(
          ProductIntegrityPrivateProfileResponse.serializer,
          wire,
        )!;
        if (preferences == null) {
          expect(decoded.user.presentationPreferences, isNull);
        } else {
          expect(decoded.user.presentationPreferences!.version, 8);
          expect(decoded.user.presentationPreferences!.leftHandedMode, isTrue);
          expect(
            standardSerializers.serializeWith(
              ProductIntegrityPrivateProfileResponse.serializer,
              decoded,
            ),
            wire,
          );
        }
      },
    );
  }

  for (final remaining in [null, 0, 29 * 86400]) {
    test(
      'privacy status preserves nullable history and policy duration $remaining',
      () {
        final wire = <String, Object?>{
          'request': null,
          if (remaining != null) 'retryAfterSeconds': remaining,
        };
        final decoded = standardSerializers.deserializeWith(
          PrivacyRequestStatusResponse.serializer,
          wire,
        )!;
        expect(decoded.request, isNull);
        expect(decoded.retryAfterSeconds, remaining);
        expect(
          standardSerializers.serializeWith(
            PrivacyRequestStatusResponse.serializer,
            decoded,
          ),
          wire,
        );
      },
    );
  }
}
