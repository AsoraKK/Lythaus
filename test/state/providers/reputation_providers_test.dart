import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';

void main() {
  test('private reputation state fails clearly without a session', () async {
    final container = ProviderContainer(
      overrides: [jwtProvider.overrideWith((ref) async => null)],
    );
    addTearDown(container.dispose);

    await expectLater(
      container.read(reputationProvider.future),
      throwsA(isA<StateError>()),
    );
  });

  test('private activity pages fail clearly without a session', () async {
    final container = ProviderContainer(
      overrides: [jwtProvider.overrideWith((ref) async => null)],
    );
    addTearDown(container.dispose);

    await expectLater(
      container.read(activityPageProvider(null).future),
      throwsA(isA<StateError>()),
    );
  });
}
