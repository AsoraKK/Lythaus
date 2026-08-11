// ignore_for_file: public_member_api_docs

/// LYTHAUS MODERATION PROVIDERS
///
/// 🎯 Purpose: Riverpod providers for moderation feature
/// 🏗️ Architecture: Application layer - manages state and dependencies
/// 🔐 Dependency Rule: UI depends on these providers, not on services directly
/// 📱 Platform: Flutter with Riverpod state management
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/core/error/error_codes.dart';

// Re-export the core repository provider for this feature
// This maintains clean feature boundaries while using shared infrastructure

/// **Legacy Compatibility Provider**
///
/// @deprecated Use core moderationRepositoryProvider instead
/// This will be removed in future versions
final moderationClientProvider = Provider<ModerationRepository>((ref) {
  return ref.watch(moderationRepositoryProvider);
});

Future<String> _requireJwtToken(Ref ref) async {
  final token = await ref.watch(jwtProvider.future);
  if (token == null || token.isEmpty) {
    throw const ModerationException('User not authenticated');
  }
  return token;
}

Future<void> _enforceModerationWriteIntegrity(
  Ref ref,
  IntegrityUseCase useCase,
) async {
  final guard = ref.read(deviceIntegrityGuardProvider);
  final decision = await guard.evaluate(useCase);
  if (!decision.allow && decision.errorCode != null) {
    throw ModerationException(
      ErrorMessages.forCode(decision.errorCode),
      code: decision.errorCode,
    );
  }
}

/// Provider for flagging content
final flagContentProvider =
    FutureProvider.family<Map<String, dynamic>, FlagSubmission>((
      ref,
      submission,
    ) async {
      await _enforceModerationWriteIntegrity(ref, IntegrityUseCase.flag);
      final repository = ref.watch(moderationRepositoryProvider);
      final token = await _requireJwtToken(ref);

      return repository.flagContent(
        contentId: submission.contentId,
        contentType: submission.contentType,
        reason: submission.reason,
        additionalDetails: submission.additionalDetails,
        token: token,
      );
    });

/// Data classes for provider parameters

class FlagSubmission {
  final String contentId;
  final String contentType;
  final String reason;
  final String? additionalDetails;

  const FlagSubmission({
    required this.contentId,
    required this.contentType,
    required this.reason,
    this.additionalDetails,
  });
}
