import 'package:lythaus/state/models/settings.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('SettingsController toggles and updates state', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final controller = container.read(settingsProvider.notifier);

    expect(container.read(settingsProvider), isA<SettingsState>());
    expect(container.read(leftHandedModeProvider), isFalse);
    expect(container.read(horizontalSwipeEnabledProvider), isTrue);
    expect(container.read(trustPassportVisibilityProvider), 'public_minimal');

    controller.toggleLeftHanded();
    controller.toggleSwipeEnabled();
    controller.toggleHaptics();
    controller.setTrustPassportVisibility('private');

    final state = container.read(settingsProvider);
    expect(state.leftHandedMode, isTrue);
    expect(state.horizontalSwipeEnabled, isFalse);
    expect(state.hapticsEnabled, isFalse);
    expect(state.trustPassportVisibility, 'private');
  });
}
