// ignore_for_file: public_member_api_docs

import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/features/profile/domain/presentation_preferences.dart';

class OwnerProfile {
  const OwnerProfile({
    required this.user,
    required this.moderationState,
    required this.publicVisibility,
    this.presentationPreferences,
  });

  final PublicUser user;
  final String moderationState;
  final bool publicVisibility;
  final PresentationPreferences? presentationPreferences;

  bool get hasDetails =>
      user.displayName.trim().isNotEmpty ||
      (user.bio?.trim().isNotEmpty ?? false);

  String get statusMessage => switch (moderationState) {
    'under_review' =>
      'Saved, under review. Your profile changes are not public yet.',
    'blocked' =>
      'Saved, but not approved for publication. Edit your details to submit them for review again.',
    'allowed' when !publicVisibility => 'Saved. Your profile is private.',
    'allowed' => 'Your profile is approved for publication.',
    _ => 'Your profile review status is unavailable. Refresh to try again.',
  };

  factory OwnerProfile.fromJson(Map<String, dynamic> json) {
    final userJson = json['user'];
    if (userJson is! Map) throw const FormatException('Invalid owner profile');
    final data = Map<String, dynamic>.from(userJson);
    final state = data['moderationState'];
    if (state is! String || data['publicVisibility'] is! bool) {
      throw const FormatException('Missing owner profile review status');
    }
    return OwnerProfile(
      user: PublicUser.fromJson(data),
      moderationState: state,
      publicVisibility: data['publicVisibility'] as bool,
      presentationPreferences: data['presentationPreferences'] == null
          ? null
          : PresentationPreferences.fromJson(
              Map<String, dynamic>.from(data['presentationPreferences'] as Map),
            ),
    );
  }
}
