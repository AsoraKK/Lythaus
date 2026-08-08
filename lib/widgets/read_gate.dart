// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/screens/lock_screen.dart';

/// User profile returned by /api/me — used to gate content access
/// (e.g. locked accounts see FirstPostLockScreen).
class UserProfile {
  final bool accountLocked;
  final String? accountCreatedAt;

  const UserProfile({required this.accountLocked, this.accountCreatedAt});

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      accountLocked: json['accountLocked'] as bool? ?? false,
      accountCreatedAt: json['accountCreatedAt'] as String?,
    );
  }
}

/// Calls GET /api/me and returns session user profile.
/// If the backend is unreachable we assume unlocked so users are not
/// blocked by transient network issues.
final meProvider = FutureProvider<UserProfile>((ref) async {
  try {
    final dio = ref.watch(secureDioProvider);
    final response = await dio.get<Map<String, dynamic>>('/me');
    if (response.data != null) {
      return UserProfile.fromJson(response.data!);
    }
    return const UserProfile(accountLocked: false);
  } catch (_) {
    // Graceful degradation: allow access when backend is unreachable,
    // the auth gate already protects unauthenticated users.
    return const UserProfile(accountLocked: false);
  }
});

class ReadGate extends ConsumerWidget {
  final Widget child;
  const ReadGate({super.key, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    return me.when(
      data: (u) => u.accountLocked ? const FirstPostLockScreen() : child,
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, __) => child, // Graceful: allow access on transient error
    );
  }
}
