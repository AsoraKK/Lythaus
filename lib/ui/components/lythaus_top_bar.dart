// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';

import 'package:lythaus/design_system/components/lyth_icon_button.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

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
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;
    return Container(
      constraints: BoxConstraints(minHeight: preferredSize.height),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: showDivider
            ? Border(bottom: BorderSide(color: theme.dividerColor, width: 1))
            : null,
      ),
      padding: EdgeInsets.symmetric(horizontal: spacing.lg),
      child: Row(
        children: [
          IconButton(
            focusNode: logoFocusNode,
            onPressed: onLogoTap,
            tooltip: 'Feed controls',
            icon: const LythBrand(
              variant: LythBrandVariant.symbol,
              height: 24,
              decorative: true,
            ),
          ),
          SizedBox(width: spacing.sm),
          Expanded(
            child: TextButton(
              focusNode: titleFocusNode,
              onPressed: onTitleTap,
              style: TextButton.styleFrom(
                alignment: Alignment.centerLeft,
                foregroundColor: theme.colorScheme.onSurface,
              ),
              child: Text(title, style: theme.textTheme.titleLarge),
            ),
          ),
          Row(
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
          ),
        ],
      ),
    );
  }
}
