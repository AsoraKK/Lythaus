import 'package:flutter/material.dart';
import 'package:lythaus/design_system/tokens/semantic_colors.dart';

/// Shared compact/expanded desktop navigation; routing remains with the shell.
class LythausSideNavigation extends StatelessWidget {
  /// Builds a presentation-only navigation rail with host-owned callbacks.
  const LythausSideNavigation({
    super.key,
    required this.currentIndex,
    required this.onDestinationSelected,
    required this.onSettings,
    required this.onHelp,
    required this.brand,
    required this.extended,
  });

  /// Selected destination in Discover, Create, Profile, Rewards order.
  final int currentIndex;

  /// Receives the destination's logical index without changing route state.
  final ValueChanged<int> onDestinationSelected;

  /// Opens the existing settings entry, including account security/sign-out.
  final VoidCallback onSettings;

  /// Opens the existing help destination.
  final VoidCallback onHelp;

  /// A passive brand slot, independent of the approved asset's shape or format.
  final Widget brand;

  /// Shows labels beside icons when true, and below icons when false.
  final bool extended;

  static const _destinations = [
    (Icons.explore_outlined, Icons.explore, 'Discover'),
    (Icons.add_circle_outline, Icons.add_circle, 'Create'),
    (Icons.person_outline, Icons.person, 'Profile'),
    (Icons.redeem_outlined, Icons.redeem, 'Rewards'),
  ];

  @override
  Widget build(BuildContext context) {
    final scale = (MediaQuery.textScalerOf(context).scale(14) / 14).clamp(
      1.0,
      double.infinity,
    );
    return SizedBox(
      width: (extended ? 224 : 104) * scale,
      child: SafeArea(
        child: FocusTraversalGroup(
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: IntrinsicHeight(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 24),
                          child: Align(
                            alignment: extended
                                ? Alignment.centerLeft
                                : Alignment.center,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                              ),
                              child: brand,
                            ),
                          ),
                        ),
                        Semantics(
                          container: true,
                          explicitChildNodes: true,
                          label: 'Main navigation',
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              for (final entry in _destinations.indexed)
                                _item(
                                  context,
                                  label: entry.$2.$3,
                                  icon: currentIndex == entry.$1
                                      ? entry.$2.$2
                                      : entry.$2.$1,
                                  selected: currentIndex == entry.$1,
                                  onPressed: () =>
                                      onDestinationSelected(entry.$1),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 24),
                        const Spacer(),
                        Semantics(
                          container: true,
                          explicitChildNodes: true,
                          label: 'Settings and help',
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Divider(height: 24),
                              _item(
                                context,
                                label: 'Settings',
                                icon: Icons.settings_outlined,
                                onPressed: onSettings,
                              ),
                              _item(
                                context,
                                label: 'Help',
                                icon: Icons.help_outline,
                                onPressed: onHelp,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _item(
    BuildContext context, {
    required String label,
    required IconData icon,
    required VoidCallback onPressed,
    bool? selected,
  }) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final foreground = selected == true
        ? colors.onPrimaryContainer
        : colors.onSurface;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: TextButton(
        onPressed: onPressed,
        style:
            TextButton.styleFrom(
              foregroundColor: foreground,
              backgroundColor: selected == true
                  ? colors.primaryContainer
                  : LythSemanticColors.clear,
              minimumSize: Size(48, extended ? 48 : 64),
              padding: EdgeInsets.symmetric(
                horizontal: extended ? 12 : 4,
                vertical: 12,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ).copyWith(
              side: WidgetStateProperty.resolveWith(
                (states) => states.contains(WidgetState.focused)
                    ? BorderSide(color: foreground, width: 2)
                    : BorderSide.none,
              ),
            ),
        child: Semantics(
          selected: selected,
          child: extended
              ? Row(
                  children: [
                    Icon(icon, size: 24),
                    const SizedBox(width: 12),
                    Expanded(child: Text(label)),
                  ],
                )
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 24),
                    const SizedBox(height: 4),
                    Text(
                      label,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: foreground,
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
