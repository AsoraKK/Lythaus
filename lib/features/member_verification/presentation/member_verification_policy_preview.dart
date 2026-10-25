// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/member_verification/domain/device_unlock_preference.dart';

final memberVerificationPreviewEnabledProvider = Provider<bool>(
  (_) => const bool.fromEnvironment(
    'MEMBER_VERIFICATION_POLICY_PREVIEW_ENABLED',
    defaultValue: false,
  ),
);

class MemberVerificationPolicyPreview extends StatelessWidget {
  const MemberVerificationPolicyPreview({super.key});

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        'Member verification: draft policy',
        style: Theme.of(context).textTheme.titleMedium,
      ),
      const ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text('App unlock on this device'),
        subtitle: Text(
          'Inactive. Default: Off. Draft choices below are for review only. '
          'Use the device password, passcode or biometrics, with a non-biometric '
          'OS fallback. This does not verify your account with the server.',
        ),
      ),
      for (final preference in DeviceUnlockPreference.values)
        Text(preference.label),
      const ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text('Recent account authentication'),
        subtitle: Text(
          'Unavailable. Server verification, freshness intervals and required '
          'actions await agreement. Session renewal is not a fresh login.',
        ),
      ),
      const ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text('Optional monthly security maintenance'),
        subtitle: Text(
          'Unavailable until activation. Qualifying server coverage must span '
          'the calendar month, with up to 24 cumulative hours of gaps. Longer '
          'gaps forfeit only this benefit. Qualifying methods share one '
          'benefit and do not stack; changing supported methods preserves '
          'qualification while coverage stays continuous. Device unlock '
          'remains a local preference and earns no points; refreshing status '
          'does not establish qualifying server coverage.',
        ),
      ),
    ],
  );
}
