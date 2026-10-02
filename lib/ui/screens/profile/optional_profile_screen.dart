// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/core/routing/auth_return_location.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:lythaus/ui/screens/profile/edit_profile_screen.dart';

class OptionalProfileScreen extends ConsumerWidget {
  const OptionalProfileScreen({super.key, this.returnTo = '/'});

  final String returnTo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final state = ref.watch(ownerProfileProvider);
    return state.when(
      data: (profile) {
        if (profile.hasDetails && ref.read(profileSetupRequestedProvider)) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!context.mounted ||
                ref.read(currentUserProvider)?.id != user?.id) {
              return;
            }
            ref.read(profileSetupRequestedProvider.notifier).state = false;
            context.go(safeAuthReturn(returnTo));
          });
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        return EditProfileScreen(
          key: ValueKey(profile.user.id),
          profile: profile,
          onboarding: true,
          onboardingReturnTo: safeAuthReturn(returnTo),
        );
      },
      loading: () => _placeholder(context, ref, loading: true),
      error: (_, _) => _placeholder(context, ref, loading: false),
    );
  }

  Widget _placeholder(
    BuildContext context,
    WidgetRef ref, {
    required bool loading,
  }) {
    return ReadingPane(
      child: Scaffold(
        appBar: AppBar(title: const Text('Set up your profile (optional)')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (loading) const CircularProgressIndicator(),
              if (!loading) const Text('Unable to load your saved profile.'),
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('You can add these details later from Profile.'),
              ),
              if (!loading)
                TextButton(
                  onPressed: () => ref.invalidate(ownerProfileProvider),
                  child: const Text('Retry'),
                ),
              TextButton(
                onPressed: () {
                  ref.read(profileSetupRequestedProvider.notifier).state =
                      false;
                  context.go(safeAuthReturn(returnTo));
                },
                child: const Text('Skip and explore'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
