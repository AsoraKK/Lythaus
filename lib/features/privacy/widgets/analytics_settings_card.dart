// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/analytics/analytics_consent.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_card.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Analytics settings card for privacy settings screen.
///
/// Provides toggle for anonymous usage data collection with clear
/// explanation and privacy policy link.
class AnalyticsSettingsCard extends ConsumerWidget {
  const AnalyticsSettingsCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final consent = ref.watch(analyticsConsentProvider);
    final consentNotifier = ref.read(analyticsConsentProvider.notifier);
    final analyticsClient = ref.read(analyticsClientProvider);
    final spacing = context.spacing;

    return LythCard(
      padding: EdgeInsets.all(spacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.analytics_outlined,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Analytics',
                  style: GoogleFonts.sora(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Share anonymous usage data',
                      style: GoogleFonts.sora(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Help us improve Lythaus by sharing anonymous usage patterns. '
                      'No personal information is collected.',
                      style: GoogleFonts.sora(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
              Switch(
                value: consent.enabled,
                onChanged: (enabled) async {
                  if (enabled) {
                    await consentNotifier.grantConsent(
                      ConsentSource.privacySettings,
                    );
                    // Log consent granted event
                    await analyticsClient.logEvent(
                      AnalyticsEvents.analyticsConsentChanged,
                      properties: {
                        AnalyticsEvents.propEnabled: true,
                        AnalyticsEvents.propSource: 'privacy_settings',
                      },
                    );
                  } else {
                    // Log consent revoked BEFORE revoking (while still enabled)
                    await analyticsClient.logEvent(
                      AnalyticsEvents.analyticsConsentChanged,
                      properties: {
                        AnalyticsEvents.propEnabled: false,
                        AnalyticsEvents.propSource: 'privacy_settings',
                      },
                    );
                    await consentNotifier.revokeConsent(
                      ConsentSource.privacySettings,
                    );
                  }
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.lock_outline, size: 16, color: Colors.grey[600]),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Data is anonymous and can be turned off at any time. '
                  'See our Privacy Policy and Terms of Service for details.',
                  style: GoogleFonts.sora(
                    fontSize: 11,
                    color: Colors.grey[600],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              LythButton.tertiary(
                label: 'Privacy Policy',
                onPressed: () async {
                  final uri = Uri.parse('https://lythaus.co/privacy');
                  if (await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                },
                icon: Icons.open_in_new,
                size: LythButtonSize.small,
              ),
              LythButton.tertiary(
                label: 'Terms of Service',
                onPressed: () async {
                  final uri = Uri.parse('https://lythaus.co/terms');
                  if (await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                },
                icon: Icons.open_in_new,
                size: LythButtonSize.small,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
