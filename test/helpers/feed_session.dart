import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';

User feedTestUser(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026, 10, 15),
  lastLoginAt: DateTime.utc(2026, 10, 15),
);

class FeedTestAuth extends StateNotifier<AsyncValue<User?>>
    implements AuthStateNotifier {
  FeedTestAuth(User? user) : super(AsyncData(user));

  void change(AsyncValue<User?> value) => state = value;
  @override
  void setUser(User user) => state = AsyncData(user);
  @override
  Future<void> signOut() async => state = const AsyncData(null);
  @override
  Future<void> continueAsGuest() => signOut();
  @override
  Future<void> refreshToken() async {}
  @override
  Future<void> validateToken() async {}
  @override
  Future<void> signInWithEmail(String email, String password) async {}
}
