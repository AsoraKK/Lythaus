// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/analytics/activity_measurement_client.dart';
import 'package:lythaus/core/analytics/activity_measurement_providers.dart';

class ActivityMeasurementSettingsCard extends ConsumerWidget {
  const ActivityMeasurementSettingsCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(activityMeasurementControllerProvider);
    final controller = ref.read(activityMeasurementControllerProvider.notifier);
    final consent = state.consent;
    final canChange =
        controller.canManage &&
        !state.loading &&
        !state.saving &&
        consent != null &&
        (consent.granted ||
            (controller.collectionEnabled && consent.pilotEnabled));
    return Semantics(
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Account activity measurement pilot'),
          const SizedBox(height: 8),
          const Text(activityMeasurementNotice),
          const SizedBox(height: 8),
          if (!controller.collectionEnabled)
            const Text('This build has activity collection disabled.'),
          if (state.loading)
            const Text('Loading account-linked consent…')
          else if (consent == null)
            const Text('Pilot consent status has not been confirmed.')
          else if (consent.granted)
            Text(
              state.saving
                  ? 'Confirming consent change…'
                  : 'You have opted in to this account-linked purpose.',
            )
          else
            const Text('You have not opted in to this account-linked purpose.'),
          if (consent != null)
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Share my active UTC dates'),
              value: consent.granted,
              onChanged: canChange ? controller.setConsent : null,
            ),
          if (state.error != null)
            Semantics(liveRegion: true, child: Text(state.error!)),
          TextButton(
            onPressed: controller.canManage && !state.loading && !state.saving
                ? controller.refresh
                : null,
            child: Text(
              consent == null
                  ? 'Review existing pilot consent'
                  : 'Refresh pilot consent',
            ),
          ),
        ],
      ),
    );
  }
}
