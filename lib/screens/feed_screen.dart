// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_snackbar.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/widgets/security_widgets.dart';
import 'package:lythaus/widgets/reputation_badge.dart';
import 'package:lythaus/features/privacy/privacy_settings_screen.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/moderation_console_screen.dart';

export 'package:lythaus/design_system/theme/lyth_theme.dart' show LythausTheme;

/// ---------------------------------------------------------------------------
///  Lythaus Feed – Perplexity‑inspired wireframe (dark‑mode default)
/// ---------------------------------------------------------------------------
///  • Soft geometric background pattern (diagonal grid)
///  • Center‑aligned header with leading profile icon & trailing share
///  • Rounded post "chips" – two full or one‑and‑two‑halves always visible
///  • Bottom search field à la Perplexity + 4‑icon nav bar
///  • Sora font everywhere
/// ---------------------------------------------------------------------------

// ---- Main screen -----------------------------------------------------------
class FeedScreen extends ConsumerWidget {
  const FeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: Builder(
          builder: (context) => IconButton(
            icon: const Icon(Icons.person_outline),
            onPressed: () => Scaffold.of(context).openDrawer(),
          ),
        ),
        title: Text(
          'Lythaus',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        actions: [
          IconButton(icon: const Icon(Icons.share_outlined), onPressed: () {}),
        ],
      ),
      drawer: _LythausDrawer(authState: authState),
      floatingActionButton: const CreatePostFAB(),
      body: const Column(
        children: [
          DeviceSecurityBanner(),
          Expanded(child: Stack(children: [_BackgroundPattern(), _FeedList()])),
        ],
      ),
      bottomNavigationBar: const _LythausNavBar(),
    );
  }
}

// ---- Background geometric pattern -----------------------------------------
class _BackgroundPattern extends StatelessWidget {
  const _BackgroundPattern();
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size.infinite,
      painter: _GridPainter(color: Colors.white.withValues(alpha: 0.02)),
    );
  }
}

class _GridPainter extends CustomPainter {
  final Color color;
  const _GridPainter({required this.color});
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;
    const step = 120.0; // spacing of diagonal lines
    // draw descending diagonals
    for (double x = -size.height; x < size.width; x += step) {
      canvas.drawLine(
        Offset(x, 0),
        Offset(x + size.height, size.height),
        paint,
      );
    }
    // draw ascending diagonals
    for (double x = 0; x < size.width + size.height; x += step) {
      canvas.drawLine(
        Offset(x, 0),
        Offset(x - size.height, size.height),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// ---- Feed list -------------------------------------------------------------
class _FeedList extends ConsumerStatefulWidget {
  const _FeedList();
  @override
  ConsumerState<_FeedList> createState() => _FeedListState();
}

class _FeedListState extends ConsumerState<_FeedList> {
  final _scrollController = ScrollController();
  late List<domain.Post> _posts;
  late final AnalyticsClient _analyticsClient;
  final DateTime _sessionStart = DateTime.now();
  DateTime _lastScrollEvent = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    _analyticsClient = ref.read(analyticsClientProvider);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _analyticsClient.logEvent(
        AnalyticsEvents.screenView,
        properties: {
          AnalyticsEvents.propScreenName: 'feed',
          AnalyticsEvents.propReferrer: 'auth_gate',
        },
      );
    });
    // seed mock data — this screen is used only in admin preview flow
    // (see preview_flow_wrapper.dart). Production feed uses HomeFeedNavigator.
    _posts = List.generate(20, (i) {
      return domain.Post(
        id: 'p$i',
        authorId: 'u${i % 5}',
        authorUsername: 'user${i % 5}',
        text: 'A demo post body showcasing compact list cards. Item #$i',
        createdAt: DateTime.now().subtract(Duration(minutes: i * 7)),
        likeCount: (i * 3) % 50,
        dislikeCount: (i * 2) % 10,
      );
    });
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      // mock pagination: append a few more items
      setState(() {
        final start = _posts.length;
        _posts.addAll(
          List.generate(10, (j) {
            final i = start + j;
            return domain.Post(
              id: 'p$i',
              authorId: 'u${i % 5}',
              authorUsername: 'user${i % 5}',
              text: 'Lazy‑loaded post #$i',
              createdAt: DateTime.now().subtract(Duration(minutes: i * 7)),
              likeCount: (i * 3) % 50,
              dislikeCount: (i * 2) % 10,
            );
          }),
        );
      });
    }

    final now = DateTime.now();
    if (now.difference(_lastScrollEvent) > const Duration(seconds: 8)) {
      _analyticsClient.logEvent(
        AnalyticsEvents.feedScrolled,
        properties: {
          AnalyticsEvents.propApproxItemsViewed:
              (_scrollController.position.pixels / 200).ceil(),
          AnalyticsEvents.propSessionDurationSeconds: now
              .difference(_sessionStart)
              .inSeconds,
        },
      );
      _lastScrollEvent = now;
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isGuest = ref.watch(authStateProvider).value == null;
    return Padding(
      padding: const EdgeInsets.only(top: kToolbarHeight + 12, bottom: 130),
      child: ListView.separated(
        controller: _scrollController,
        padding: const EdgeInsets.only(right: 12),
        itemCount: _posts.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final p = _posts[index];
          return Align(
            alignment: Alignment.topLeft,
            child: _PostCard(
              username: 'User${p.authorId}',
              text: p.text,
              isGuest: isGuest,
            ),
          );
        },
      ),
    );
  }
}

// ---- Post card -------------------------------------------------------------
class _PostCard extends StatelessWidget {
  final String username;
  final String text;
  final bool isGuest;
  const _PostCard({
    required this.username,
    required this.text,
    required this.isGuest,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Align(
      alignment: Alignment.topLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircleAvatar(
                      radius: 22,
                      backgroundColor: theme.colorScheme.primary,
                      child: Text(
                        username[0].toUpperCase(),
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: theme.colorScheme.onPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      username,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  text,
                  style: theme.textTheme.bodyMedium?.copyWith(height: 1.4),
                ),
                const SizedBox(height: 12),
                IconTheme(
                  data: const IconThemeData(size: 20, color: Colors.white60),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.thumb_up_alt_outlined),
                        onPressed: isGuest
                            ? () => _promptSignIn(context)
                            : () {},
                      ),
                      const SizedBox(width: 4),
                      IconButton(
                        icon: const Icon(Icons.thumb_down_alt_outlined),
                        onPressed: isGuest
                            ? () => _promptSignIn(context)
                            : () {},
                      ),
                      const SizedBox(width: 4),
                      IconButton(
                        icon: const Icon(Icons.chat_bubble_outline),
                        onPressed: isGuest
                            ? () => _promptSignIn(context)
                            : () {},
                      ),
                      const SizedBox(width: 4),
                      IconButton(
                        icon: const Icon(Icons.flag_outlined),
                        onPressed: isGuest
                            ? () => _promptSignIn(context)
                            : () {},
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

void _promptSignIn(BuildContext context) {
  ScaffoldMessenger.of(context).hideCurrentSnackBar();
  LythSnackbar.info(
    context: context,
    message: 'Sign in to like, comment, or report.',
    duration: const Duration(seconds: 2),
  );
}

// ---- Bottom nav ------------------------------------------------------------
class _LythausNavBar extends StatelessWidget {
  const _LythausNavBar();
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return NavigationBar(
      height: 80,
      destinations: const [
        NavigationDestination(icon: Icon(Icons.search), label: ''),
        NavigationDestination(icon: Icon(Icons.route_outlined), label: ''),
        NavigationDestination(
          icon: Icon(Icons.auto_awesome_outlined),
          label: '',
        ),
        NavigationDestination(icon: Icon(Icons.sensors_outlined), label: ''),
      ],
      backgroundColor: scheme.surface,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysHide,
    );
  }
}

// ---- Navigation Drawer ----------------------------------------------------
class _LythausDrawer extends ConsumerWidget {
  final AsyncValue<User?> authState;

  const _LythausDrawer({required this.authState});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isSignedIn = authState.value != null;
    final user = authState.value;
    final isModerator =
        user?.role == UserRole.moderator || user?.role == UserRole.admin;

    return Drawer(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          DrawerHeader(
            decoration: BoxDecoration(
              color: theme.colorScheme.primary,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  theme.colorScheme.primary,
                  theme.colorScheme.secondary,
                ],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 30,
                  backgroundColor: theme.colorScheme.onPrimary.withValues(
                    alpha: 0.2,
                  ),
                  child: Icon(
                    isSignedIn ? Icons.person : Icons.person_outline,
                    size: 32,
                    color: theme.colorScheme.onPrimary,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  isSignedIn ? 'Welcome back!' : 'Welcome to Lythaus',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: theme.colorScheme.onPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (isSignedIn && user != null) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      ReputationBadge(
                        score: user.reputationScore,
                        size: ReputationBadgeSize.medium,
                        showLabel: true,
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),

          // Navigation items
          if (isSignedIn) ...[
            if (isModerator)
              ListTile(
                leading: const Icon(Icons.rule_folder_outlined),
                title: const Text('Moderation Queue'),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (context) => const ModerationConsoleScreen(),
                    ),
                  );
                },
              ),
            ListTile(
              leading: const Icon(Icons.person),
              title: const Text('Profile'),
              onTap: () {
                Navigator.pop(context);
                _showComingSoon(context, 'Profile');
              },
            ),
            ListTile(
              leading: const Icon(Icons.notifications_outlined),
              title: const Text('Notifications'),
              onTap: () {
                Navigator.pop(context);
                _showComingSoon(context, 'Notifications');
              },
            ),
            ListTile(
              leading: const Icon(Icons.privacy_tip_outlined),
              title: const Text('Privacy Settings'),
              onTap: () {
                Navigator.pop(context);
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) => const PrivacySettingsScreen(),
                  ),
                );
              },
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.settings_outlined),
              title: const Text('Settings'),
              onTap: () {
                Navigator.pop(context);
                _showComingSoon(context, 'Settings');
              },
            ),
            ListTile(
              leading: const Icon(Icons.help_outline),
              title: const Text('Help & Support'),
              onTap: () {
                Navigator.pop(context);
                _showComingSoon(context, 'Help & Support');
              },
            ),
            const Divider(),
            ListTile(
              leading: Icon(Icons.logout, color: theme.colorScheme.error),
              title: Text(
                'Sign Out',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.error,
                  fontWeight: FontWeight.w600,
                ),
              ),
              onTap: () => _handleSignOut(context, ref),
            ),
          ] else ...[
            ListTile(
              leading: const Icon(Icons.login),
              title: const Text('Sign In'),
              onTap: () {
                Navigator.pop(context);
                _showComingSoon(context, 'Sign In');
              },
            ),
            ListTile(
              leading: const Icon(Icons.person_add),
              title: const Text('Sign Up'),
              onTap: () {
                Navigator.pop(context);
                _showComingSoon(context, 'Sign Up');
              },
            ),
          ],

          const Divider(),
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: const Text('About Lythaus'),
            onTap: () {
              Navigator.pop(context);
              _showAboutDialog(context);
            },
          ),
        ],
      ),
    );
  }

  void _showComingSoon(BuildContext context, String featureName) {
    LythSnackbar.info(
      context: context,
      message: '$featureName is coming soon.',
      duration: const Duration(seconds: 2),
    );
  }

  void _handleSignOut(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign Out'),
        content: Text(
          'Are you sure you want to sign out?',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        actions: [
          LythButton.tertiary(
            label: 'Cancel',
            onPressed: () => Navigator.of(context).pop(),
          ),
          LythButton.primary(
            label: 'Sign Out',
            onPressed: () {
              Navigator.of(context).pop(); // Close dialog
              Navigator.of(context).pop(); // Close drawer
              // Sign out using the auth state notifier
              ref.read(authStateProvider.notifier).signOut();
            },
          ),
        ],
      ),
    );
  }

  void _showAboutDialog(BuildContext context) {
    showAboutDialog(
      context: context,
      applicationName: 'Lythaus',
      applicationVersion: '1.0.0',
      applicationIcon: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          gradient: LinearGradient(
            colors: [
              Theme.of(context).colorScheme.primary,
              Theme.of(context).colorScheme.secondary,
            ],
          ),
        ),
        child: const Icon(Icons.auto_awesome, color: Colors.white, size: 24),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 16),
          child: Text(
            'A social platform for authentic human-authored content with AI-powered verification.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}
