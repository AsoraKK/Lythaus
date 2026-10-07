// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/profile/domain/presentation_preferences.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class PresentationPreferencesSection extends ConsumerStatefulWidget {
  const PresentationPreferencesSection({super.key});

  @override
  ConsumerState<PresentationPreferencesSection> createState() =>
      _PresentationPreferencesSectionState();
}

class _PresentationPreferencesSectionState
    extends ConsumerState<PresentationPreferencesSection> {
  PresentationPreferences? _draft;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final settings = ref.read(settingsProvider);
      if (!settings.preferencesLoading &&
          !settings.preferencesSaving &&
          !settings.preferencesRetryPending) {
        ref.read(settingsProvider.notifier).reload();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);
    final controller = ref.read(settingsProvider.notifier);
    final account = ref.watch(currentUserProvider) != null;
    ref.listen(settingsProvider, (previous, next) {
      if (previous?.preferencesOwnerId != next.preferencesOwnerId ||
          (previous?.preferencesLoading == true && !next.preferencesLoading) ||
          (previous?.preferencesSaving == true &&
              !next.preferencesSaving &&
              !next.preferencesRetryPending)) {
        setState(() => _draft = null);
      }
    });
    final left = _draft?.leftHandedMode ?? settings.leftHandedMode;
    final swipe =
        _draft?.horizontalSwipeEnabled ?? settings.horizontalSwipeEnabled;
    final busy = settings.preferencesLoading || settings.preferencesSaving;
    final editable =
        settings.preferencesAvailable &&
        !busy &&
        !settings.preferencesRetryPending;
    final dirty =
        left != settings.leftHandedMode ||
        swipe != settings.horizontalSwipeEnabled;
    return Semantics(
      container: true,
      explicitChildNodes: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Preferences', style: Theme.of(context).textTheme.titleLarge),
          Text(
            account
                ? 'Save these choices to your account for signed-in devices.'
                : 'Save these choices on this device for guest use. Account choices stay separate.',
          ),
          if (busy)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: Spacing.sm),
              child: LinearProgressIndicator(minHeight: 2),
            ),
          SwitchListTile(
            title: const Text('Swipe between profile tabs'),
            subtitle: const Text('Tabs remain available when swipe is off.'),
            value: swipe,
            onChanged: editable
                ? (value) => setState(
                    () => _draft = PresentationPreferences(
                      leftHandedMode: left,
                      horizontalSwipeEnabled: value,
                      version: settings.preferencesVersion,
                    ),
                  )
                : null,
          ),
          SwitchListTile(
            title: const Text('Left-handed mode (mirror nav)'),
            value: left,
            onChanged: editable
                ? (value) => setState(
                    () => _draft = PresentationPreferences(
                      leftHandedMode: value,
                      horizontalSwipeEnabled: swipe,
                      version: settings.preferencesVersion,
                    ),
                  )
                : null,
          ),
          if (settings.preferencesMessage != null)
            Semantics(
              liveRegion: true,
              child: Text(settings.preferencesMessage!),
            ),
          Wrap(
            spacing: Spacing.sm,
            runSpacing: Spacing.sm,
            children: [
              FilledButton(
                onPressed:
                    !busy &&
                        settings.preferencesAvailable &&
                        (dirty || settings.preferencesRetryPending)
                    ? () => controller.savePreferences(
                        leftHandedMode: left,
                        horizontalSwipeEnabled: swipe,
                      )
                    : null,
                child: Text(
                  settings.preferencesSaving
                      ? 'Saving preferences…'
                      : settings.preferencesRetryPending
                      ? 'Retry save preferences'
                      : 'Save preferences',
                ),
              ),
              if (dirty && !settings.preferencesRetryPending && !busy)
                TextButton(
                  onPressed: () => setState(() => _draft = null),
                  child: const Text('Discard preference changes'),
                ),
              TextButton(
                onPressed: busy ? null : () => controller.reload(),
                child: const Text('Reload saved preferences'),
              ),
              if (!account && !settings.preferencesAvailable && !busy)
                TextButton(
                  onPressed: () => controller.resetGuestPreferences(),
                  child: const Text('Reset guest preferences to defaults'),
                ),
            ],
          ),
          if (dirty && !settings.preferencesRetryPending)
            const Text(
              'Leave without saving to resume later. Unsaved choices are discarded.',
            ),
          const ListTile(
            title: Text('Haptics'),
            subtitle: Text('Haptic feedback is not available in this app yet.'),
          ),
        ],
      ),
    );
  }
}
