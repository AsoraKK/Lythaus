// ignore_for_file: public_member_api_docs

// LYTHAUS SECURITY WIDGETS
//
// 🎯 Purpose: UI components for security warnings and device integrity
// 🔐 Security: Non-dismissible banners, post blocking, user education
// 🎨 Design: Material Design with clear security messaging
// 📱 Platform: Flutter with Riverpod state management

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/core/security/device_integrity.dart';

/// Security banner for compromised devices
class DeviceSecurityBanner extends ConsumerWidget {
  const DeviceSecurityBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final deviceIntegrity = ref.watch(deviceIntegrityProvider);

    return deviceIntegrity.when(
      data: (info) {
        if (info.status == DeviceIntegrityStatus.compromised) {
          return _CompromisedDeviceBanner(info: info);
        }
        return const SizedBox.shrink();
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

/// Non-dismissible banner for compromised devices
class _CompromisedDeviceBanner extends StatelessWidget {
  final DeviceIntegrityInfo info;

  const _CompromisedDeviceBanner({required this.info});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Colors.red.shade800,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          const Icon(Icons.security, color: Colors.white, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Device Security Warning',
                  style: GoogleFonts.sora(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Device compromised. Posting disabled for security.',
                  style: GoogleFonts.sora(
                    color: Colors.white70,
                    fontSize: 12,
                    fontWeight: FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.info_outline, color: Colors.white70),
            onPressed: () => _showSecurityDialog(context),
          ),
        ],
      ),
    );
  }

  void _showSecurityDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            const Icon(Icons.security, color: Colors.red),
            const SizedBox(width: 8),
            Text(
              'Device Security',
              style: GoogleFonts.sora(fontWeight: FontWeight.w600),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Your device appears to be rooted or jailbroken.',
              style: GoogleFonts.sora(),
            ),
            const SizedBox(height: 12),
            Text(
              'For security reasons:',
              style: GoogleFonts.sora(fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 8),
            _buildSecurityPoint('• You can still read content'),
            _buildSecurityPoint('• Creating posts is disabled'),
            _buildSecurityPoint('• Some features may be limited'),
            const SizedBox(height: 12),
            Text(
              'This protects the community from potential security risks.',
              style: GoogleFonts.sora(fontSize: 12, color: Colors.grey[600]),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text('Understood', style: GoogleFonts.sora()),
          ),
        ],
      ),
    );
  }

  Widget _buildSecurityPoint(String text) {
    return Padding(
      padding: const EdgeInsets.only(left: 8, bottom: 4),
      child: Text(text, style: GoogleFonts.sora(fontSize: 13)),
    );
  }
}

/// FAB wrapper that shows security dialog on compromised devices
class SecureFloatingActionButton extends ConsumerWidget {
  final VoidCallback? onPressed;
  final Widget child;
  final String? tooltip;

  const SecureFloatingActionButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.tooltip,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final postingAllowed = ref.watch(postingAllowedProvider);

    return FloatingActionButton(
      onPressed: postingAllowed ? onPressed : () => _showBlockedDialog(context),
      tooltip: tooltip,
      child: child,
    );
  }

  void _showBlockedDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            const Icon(Icons.block, color: Colors.red),
            const SizedBox(width: 8),
            Text(
              'Action Blocked',
              style: GoogleFonts.sora(fontWeight: FontWeight.w600),
            ),
          ],
        ),
        content: Text(
          'Creating posts is disabled on compromised devices for security reasons. You can still browse and read content.',
          style: GoogleFonts.sora(),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text('OK', style: GoogleFonts.sora()),
          ),
        ],
      ),
    );
  }
}

/// Widget that shows device security status in settings/debug
class DeviceSecurityStatus extends ConsumerWidget {
  const DeviceSecurityStatus({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final deviceIntegrity = ref.watch(deviceIntegrityProvider);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.security),
                const SizedBox(width: 8),
                Text(
                  'Device Security',
                  style: GoogleFonts.sora(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            deviceIntegrity.when(
              data: (info) => _buildSecurityInfo(info),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Text(
                'Error checking device security: $error',
                style: GoogleFonts.sora(color: Colors.red),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSecurityInfo(DeviceIntegrityInfo info) {
    final statusColor = switch (info.status) {
      DeviceIntegrityStatus.secure => Colors.green,
      DeviceIntegrityStatus.compromised => Colors.red,
      DeviceIntegrityStatus.error => Colors.orange,
      DeviceIntegrityStatus.unknown => Colors.grey,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.circle, size: 12, color: statusColor),
            const SizedBox(width: 8),
            Text(
              info.status.name.toUpperCase(),
              style: GoogleFonts.sora(
                fontWeight: FontWeight.w600,
                color: statusColor,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text('Reason: ${info.reason}', style: GoogleFonts.sora(fontSize: 13)),
        Text(
          'Checked: ${info.checkedAt.toLocal().toString().split('.')[0]}',
          style: GoogleFonts.sora(fontSize: 12, color: Colors.grey[600]),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            _buildCapability('Reading', info.allowReading),
            const SizedBox(width: 16),
            _buildCapability('Posting', info.allowPosting),
          ],
        ),
      ],
    );
  }

  Widget _buildCapability(String label, bool allowed) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          allowed ? Icons.check_circle : Icons.cancel,
          size: 16,
          color: allowed ? Colors.green : Colors.red,
        ),
        const SizedBox(width: 4),
        Text(label, style: GoogleFonts.sora(fontSize: 12)),
      ],
    );
  }
}
