// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/lyth_color_schemes.dart';
import 'package:lythaus/design_system/theme/lyth_theme_extensions.dart';
import 'package:lythaus/design_system/tokens/radius.dart';
import 'package:lythaus/design_system/tokens/semantic_colors.dart';
import 'package:lythaus/design_system/tokens/spacing.dart';

class LythausTheme {
  static ThemeData light() => _build(LythColorSchemes.light());

  static ThemeData dark() => _build(LythColorSchemes.dark());

  static ThemeData _build(ColorScheme colors) {
    final semantic = LythSemanticColors.of(colors.brightness);
    final text = TextTheme(
      displayLarge: _text(colors, 32, FontWeight.w700, 1.2, tracking: -0.6),
      displayMedium: _text(colors, 28, FontWeight.w700, 1.25, tracking: -0.4),
      displaySmall: _text(colors, 24, FontWeight.w700, 1.3, tracking: -0.3),
      headlineLarge: _text(colors, 28, FontWeight.w700, 1.25, tracking: -0.4),
      headlineMedium: _text(colors, 24, FontWeight.w700, 1.3, tracking: -0.3),
      headlineSmall: _text(colors, 20, FontWeight.w600, 1.35),
      titleLarge: _text(colors, 18, FontWeight.w600, 1.4),
      titleMedium: _text(colors, 16, FontWeight.w600, 1.4),
      titleSmall: _text(colors, 14, FontWeight.w600, 1.4),
      bodyLarge: _text(colors, 16, FontWeight.w400, 1.6),
      bodyMedium: _text(colors, 14, FontWeight.w400, 1.5),
      bodySmall: _text(
        colors,
        12,
        FontWeight.w400,
        1.5,
      ).copyWith(color: semantic['muted']),
      labelLarge: _text(colors, 14, FontWeight.w600, 1.4),
      labelMedium: _text(colors, 12, FontWeight.w600, 1.4),
      labelSmall: _text(colors, 12, FontWeight.w600, 1.4),
    );
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(LythRadius.button),
    );
    final button = ButtonStyle(
      minimumSize: const WidgetStatePropertyAll(
        Size(LythSpacing.minTapTarget, LythSpacing.minTapTarget),
      ),
      padding: const WidgetStatePropertyAll(
        EdgeInsets.symmetric(
          horizontal: LythSpacing.lg,
          vertical: LythSpacing.md,
        ),
      ),
      shape: WidgetStatePropertyAll(shape),
      textStyle: WidgetStatePropertyAll(text.labelLarge),
      elevation: const WidgetStatePropertyAll(0),
      animationDuration: const Duration(milliseconds: 160),
      tapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
      side: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.focused)) {
          return BorderSide(color: colors.onSurface, width: 2);
        }
        return BorderSide.none;
      }),
    );
    OutlineInputBorder inputBorder(Color color, [double width = 1]) =>
        OutlineInputBorder(
          borderRadius: BorderRadius.circular(LythRadius.input),
          borderSide: BorderSide(color: color, width: width),
        );
    return ThemeData(
      useMaterial3: true,
      brightness: colors.brightness,
      colorScheme: colors,
      fontFamily: 'Manrope',
      textTheme: text,
      scaffoldBackgroundColor: colors.surface,
      canvasColor: colors.surfaceContainer,
      disabledColor: semantic['muted']!.withValues(alpha: 0.6),
      dividerColor: colors.outlineVariant,
      focusColor: colors.primary.withValues(alpha: 0.16),
      hoverColor: colors.onSurface.withValues(alpha: 0.06),
      highlightColor: colors.primary.withValues(alpha: 0.12),
      visualDensity: VisualDensity.standard,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      extensions: [LythThemeExtension.light()],
      appBarTheme: AppBarTheme(
        backgroundColor: colors.surface,
        foregroundColor: colors.onSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: text.titleLarge,
        toolbarHeight: 64,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: button.merge(
          ElevatedButton.styleFrom(
            backgroundColor: colors.primary,
            foregroundColor: colors.onPrimary,
            disabledBackgroundColor: colors.surfaceContainerHigh,
            disabledForegroundColor: semantic['muted'],
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: button.merge(
          FilledButton.styleFrom(
            backgroundColor: colors.primary,
            foregroundColor: colors.onPrimary,
            disabledBackgroundColor: colors.surfaceContainerHigh,
            disabledForegroundColor: semantic['muted'],
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: button.copyWith(
          foregroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.disabled)
                ? semantic['muted']
                : colors.onSurface,
          ),
          side: WidgetStateProperty.resolveWith(
            (states) => BorderSide(
              color: states.contains(WidgetState.focused)
                  ? colors.primary
                  : colors.outline,
              width: states.contains(WidgetState.focused) ? 2 : 1,
            ),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: button.merge(
          TextButton.styleFrom(foregroundColor: colors.primary),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size(48, 48),
          foregroundColor: colors.onSurfaceVariant,
          shape: shape,
        ),
      ),
      cardTheme: CardThemeData(
        color: colors.surfaceContainer,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(LythRadius.card),
          side: BorderSide(color: colors.outlineVariant),
        ),
        clipBehavior: Clip.antiAlias,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.surfaceContainer,
        contentPadding: const EdgeInsets.all(LythSpacing.lg),
        constraints: const BoxConstraints(minHeight: LythSpacing.minTapTarget),
        border: inputBorder(colors.outline),
        enabledBorder: inputBorder(colors.outline),
        focusedBorder: inputBorder(colors.primary, 2),
        errorBorder: inputBorder(colors.error),
        focusedErrorBorder: inputBorder(colors.error, 2),
        disabledBorder: inputBorder(colors.outlineVariant),
        hintStyle: text.bodyMedium?.copyWith(color: semantic['muted']),
        labelStyle: text.bodyMedium?.copyWith(color: colors.onSurfaceVariant),
        floatingLabelStyle: text.labelLarge?.copyWith(color: colors.primary),
        helperStyle: text.bodySmall,
        errorStyle: text.bodySmall?.copyWith(color: colors.error),
        errorMaxLines: 4,
        helperMaxLines: 4,
        prefixIconColor: colors.onSurfaceVariant,
        suffixIconColor: colors.onSurfaceVariant,
      ),
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: colors.primary,
        selectionColor: colors.primary.withValues(alpha: 0.28),
        selectionHandleColor: colors.primary,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: colors.surfaceContainer,
        selectedColor: colors.primaryContainer,
        disabledColor: colors.surfaceContainerHigh,
        labelStyle: text.labelLarge?.copyWith(color: colors.onSurface),
        secondaryLabelStyle: text.labelLarge?.copyWith(
          color: colors.onPrimaryContainer,
        ),
        side: BorderSide(color: colors.outline),
        shape: shape,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        showCheckmark: true,
        checkmarkColor: colors.onPrimaryContainer,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: colors.surfaceContainer,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        indicatorColor: colors.primaryContainer,
        indicatorShape: shape,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => text.labelMedium?.copyWith(
            color: states.contains(WidgetState.selected)
                ? colors.primary
                : colors.onSurfaceVariant,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected)
                ? colors.primary
                : colors.onSurfaceVariant,
          ),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: colors.surface,
        selectedIconTheme: IconThemeData(color: colors.primary),
        unselectedIconTheme: IconThemeData(color: colors.onSurfaceVariant),
        selectedLabelTextStyle: text.labelLarge?.copyWith(
          color: colors.primary,
        ),
        unselectedLabelTextStyle: text.labelLarge,
        indicatorColor: colors.primaryContainer,
        indicatorShape: shape,
        useIndicator: true,
      ),
      navigationDrawerTheme: NavigationDrawerThemeData(
        backgroundColor: colors.surfaceContainer,
        indicatorColor: colors.primaryContainer,
        indicatorShape: shape,
      ),
      drawerTheme: DrawerThemeData(
        backgroundColor: colors.surfaceContainer,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: colors.primary,
        unselectedLabelColor: colors.onSurfaceVariant,
        labelStyle: text.labelLarge,
        unselectedLabelStyle: text.labelLarge,
        indicatorColor: colors.primary,
        dividerColor: colors.outlineVariant,
      ),
      listTileTheme: ListTileThemeData(
        textColor: colors.onSurface,
        iconColor: colors.onSurfaceVariant,
        selectedColor: colors.primary,
        selectedTileColor: colors.primaryContainer,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        minVerticalPadding: 12,
        titleTextStyle: text.bodyLarge,
        subtitleTextStyle: text.bodyMedium?.copyWith(
          color: colors.onSurfaceVariant,
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: colors.surfaceContainer,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        titleTextStyle: text.headlineSmall,
        contentTextStyle: text.bodyMedium,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(LythRadius.dialog),
          side: BorderSide(color: colors.outlineVariant),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.surfaceContainer,
        modalBackgroundColor: colors.surfaceContainer,
        surfaceTintColor: Colors.transparent,
        dragHandleColor: colors.outline,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: colors.surfaceContainerHigh,
        surfaceTintColor: Colors.transparent,
        textStyle: text.bodyMedium,
        shape: shape,
      ),
      dividerTheme: DividerThemeData(
        color: colors.outlineVariant,
        thickness: 1,
        space: 24,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: colors.surfaceContainerHigh,
        contentTextStyle: text.bodyMedium,
        actionTextColor: colors.primary,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(LythRadius.sm),
          side: BorderSide(color: colors.outline),
        ),
        behavior: SnackBarBehavior.floating,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? colors.onPrimary
              : colors.outline,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? colors.primary
              : colors.surfaceContainer,
        ),
        trackOutlineColor: WidgetStatePropertyAll(colors.outline),
      ),
      checkboxTheme: CheckboxThemeData(
        checkColor: WidgetStatePropertyAll(colors.onPrimary),
        fillColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? colors.primary
              : Colors.transparent,
        ),
        side: BorderSide(color: colors.outline, width: 2),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? colors.primary
              : colors.outline,
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: colors.primary,
        linearTrackColor: colors.surfaceContainerHigh,
        linearMinHeight: 4,
      ),
      dataTableTheme: DataTableThemeData(
        headingTextStyle: text.labelLarge,
        dataTextStyle: text.bodyMedium,
        dividerThickness: 1,
        headingRowColor: WidgetStatePropertyAll(colors.surfaceContainerHigh),
        dataRowMinHeight: 56,
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: colors.inverseSurface,
          borderRadius: BorderRadius.circular(LythRadius.xs),
        ),
        textStyle: text.bodySmall?.copyWith(color: colors.onInverseSurface),
      ),
    );
  }

  static TextStyle _text(
    ColorScheme colors,
    double size,
    FontWeight weight,
    double height, {
    double tracking = 0,
  }) => TextStyle(
    fontFamily: 'Manrope',
    fontSize: size,
    fontWeight: weight,
    height: height,
    letterSpacing: tracking,
    color: colors.onSurface,
  );
}
