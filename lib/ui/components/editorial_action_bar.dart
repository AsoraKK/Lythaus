import 'package:flutter/material.dart';
import 'package:lythaus/design_system/tokens/semantic_colors.dart';

/// Persistent actions, independent of the current destination.
class EditorialActionBar extends StatelessWidget {
  /// Connects actions to existing destinations without selecting a tab.
  const EditorialActionBar({
    super.key,
    required this.onCreate,
    required this.onSearch,
    required this.onMenu,
    this.menuFocusNode,
    this.leftHanded = false,
  });

  /// Opens or resumes the composer.
  final VoidCallback onCreate;

  /// Opens search, retaining the current feed position.
  final VoidCallback onSearch;

  /// Opens the secondary navigation panel.
  final VoidCallback onMenu;

  /// Restores keyboard focus after the panel closes.
  final FocusNode? menuFocusNode;

  /// Mirrors action order using the existing account preference.
  final bool leftHanded;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final large = MediaQuery.textScalerOf(context).scale(14) > 22;
    Widget action(
      String label,
      IconData icon,
      VoidCallback onPressed, {
      bool primary = false,
      FocusNode? focusNode,
    }) {
      final children = [Icon(icon, size: 20), Text(label)];
      return Expanded(
        child: TextButton(
          focusNode: focusNode,
          onPressed: onPressed,
          style: TextButton.styleFrom(
            backgroundColor: primary ? LythSemanticColors.accent : null,
            foregroundColor: primary
                ? LythSemanticColors.canvas
                : theme.colorScheme.onSurface,
            minimumSize: Size(48, large ? 78 : 48),
            padding: EdgeInsets.symmetric(
              horizontal: large ? 2 : 8,
              vertical: 8,
            ),
            shape: const RoundedRectangleBorder(),
            textStyle: theme.textTheme.labelLarge,
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final text = TextPainter(
                text: TextSpan(text: label, style: theme.textTheme.labelLarge),
                textDirection: Directionality.of(context),
                textScaler: MediaQuery.textScalerOf(context),
              )..layout();
              final stacked = large || text.width + 28 > constraints.maxWidth;
              text.dispose();
              return stacked
                  ? Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        children[0],
                        const SizedBox(height: 4),
                        children[1],
                      ],
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        children[0],
                        const SizedBox(width: 8),
                        children[1],
                      ],
                    );
            },
          ),
        ),
      );
    }

    return ColoredBox(
      color: theme.colorScheme.surface,
      child: SafeArea(
        top: false,
        child: Center(
          heightFactor: 1,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 456),
            child: DecoratedBox(
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: theme.colorScheme.outline),
                ),
              ),
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  large ? 4 : 16,
                  8,
                  large ? 4 : 16,
                  8,
                ),
                child: Row(
                  children: (leftHanded
                      ? <Widget>[
                          action(
                            'Menu',
                            Icons.menu,
                            onMenu,
                            focusNode: menuFocusNode,
                          ),
                          action('Search', Icons.search, onSearch),
                          action('Create', Icons.add, onCreate, primary: true),
                        ]
                      : <Widget>[
                          action('Create', Icons.add, onCreate, primary: true),
                          action('Search', Icons.search, onSearch),
                          action(
                            'Menu',
                            Icons.menu,
                            onMenu,
                            focusNode: menuFocusNode,
                          ),
                        ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
