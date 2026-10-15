// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/components/lyth_icon_button.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';

class LythausTopBar extends StatelessWidget implements PreferredSizeWidget {
  const LythausTopBar({
    super.key,
    required this.title,
    this.onLogoTap,
    this.onTitleTap,
    this.onSearchTap,
    this.onTrendingTap,
    this.logoFocusNode,
    this.titleFocusNode,
    this.showDivider = false,
    this.useWordmark = false,
  });

  final String title;
  final VoidCallback? onLogoTap;
  final VoidCallback? onTitleTap;
  final VoidCallback? onSearchTap;
  final VoidCallback? onTrendingTap;
  final FocusNode? logoFocusNode;
  final FocusNode? titleFocusNode;
  final bool showDivider;
  final bool useWordmark;

  @override
  Size get preferredSize => Size.fromHeight(useWordmark ? 72 : 56);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;
    final logo = IconButton(
      focusNode: logoFocusNode,
      onPressed: onLogoTap,
      tooltip: 'Feed controls',
      icon: const LythBrandMark(excludeFromSemantics: true),
    );
    final actions = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        LythIconButton(
          icon: Icons.search,
          tooltip: 'Search',
          onPressed: onSearchTap,
        ),
        LythIconButton(
          icon: Icons.trending_up_outlined,
          tooltip: 'Trending',
          onPressed: onTrendingTap,
        ),
      ],
    );
    Widget titleButton({required bool includeWordmark}) => TextButton(
      focusNode: titleFocusNode,
      onPressed: onTitleTap,
      style: TextButton.styleFrom(
        alignment: Alignment.centerLeft,
        foregroundColor: theme.colorScheme.onSurface,
        padding: EdgeInsets.all(spacing.sm),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (includeWordmark) ...[
            const LythBrandWordmark(height: 12),
            SizedBox(height: spacing.xs),
          ],
          Text(title, style: theme.textTheme.titleLarge),
        ],
      ),
    );
    return Container(
      constraints: BoxConstraints(minHeight: preferredSize.height),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: showDivider
            ? Border(bottom: BorderSide(color: theme.dividerColor, width: 1))
            : null,
      ),
      padding: EdgeInsets.symmetric(horizontal: spacing.lg),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final expandedText =
              constraints.maxWidth < 480 &&
              MediaQuery.textScalerOf(context).scale(18) > 24;
          if (expandedText) {
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    logo,
                    SizedBox(width: spacing.sm),
                    Expanded(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: useWordmark
                            ? const LythBrandWordmark()
                            : const SizedBox.shrink(),
                      ),
                    ),
                    actions,
                  ],
                ),
                titleButton(includeWordmark: false),
              ],
            );
          }
          return Row(
            children: [
              logo,
              SizedBox(width: spacing.sm),
              Expanded(child: titleButton(includeWordmark: useWordmark)),
              actions,
            ],
          );
        },
      ),
    );
  }
}
