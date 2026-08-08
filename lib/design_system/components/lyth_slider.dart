// ignore_for_file: public_member_api_docs

/// Lythaus Slider Component
///
/// Input component for selecting a value from a range.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Semantic slider component
///
/// High-level wrapper for Slider providing consistent styling.
/// Used for selecting values in a range (volume, sensitivity, etc.).
///
/// Usage:
/// ```dart
/// LythSlider(
///   value: _volume,
///   min: 0,
///   max: 100,
///   onChanged: (value) => setState(() => _volume = value),
///   label: 'Volume',
/// )
/// ```
class LythSlider extends StatelessWidget {
  /// Current slider value
  final double value;

  /// Minimum value
  final double min;

  /// Maximum value
  final double max;

  /// Number of divisions (for discrete steps)
  final int? divisions;

  /// Callback when value changes
  final ValueChanged<double>? onChanged;

  /// Callback when drag ends
  final ValueChanged<double>? onChangeEnd;

  /// Label for the slider
  final String? label;

  /// Whether slider is disabled
  final bool disabled;

  /// Whether to show value label
  final bool showLabel;

  const LythSlider({
    required this.value,
    this.min = 0,
    this.max = 100,
    this.divisions,
    this.onChanged,
    this.onChangeEnd,
    this.label,
    this.disabled = false,
    this.showLabel = true,
    super.key,
  });

  String _formatValue(double value) {
    if (value == value.toInt()) {
      return value.toInt().toString();
    }
    return value.toStringAsFixed(1);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Label
        if (label != null) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label!,
                style: context.textTheme.labelLarge?.copyWith(
                  color: context.colorScheme.onSurface,
                ),
              ),
              if (showLabel)
                Text(
                  _formatValue(value),
                  style: context.textTheme.labelMedium?.copyWith(
                    color: context.colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
            ],
          ),
          SizedBox(height: context.spacing.sm.toDouble()),
        ],

        // Slider
        Slider(
          value: value,
          min: min,
          max: max,
          divisions: divisions,
          onChanged: disabled ? null : onChanged,
          onChangeEnd: onChangeEnd,
          activeColor: context.colorScheme.primary,
          inactiveColor: context.colorScheme.outline.withValues(alpha: 0.2),
          label: showLabel ? _formatValue(value) : null,
        ),
      ],
    );
  }
}

/// Range slider component for selecting min/max values
class LythRangeSlider extends StatelessWidget {
  /// Current range values
  final RangeValues values;

  /// Minimum value
  final double min;

  /// Maximum value
  final double max;

  /// Number of divisions (for discrete steps)
  final int? divisions;

  /// Callback when range changes
  final ValueChanged<RangeValues>? onChanged;

  /// Callback when drag ends
  final ValueChanged<RangeValues>? onChangeEnd;

  /// Label for the slider
  final String? label;

  /// Whether slider is disabled
  final bool disabled;

  const LythRangeSlider({
    required this.values,
    this.min = 0,
    this.max = 100,
    this.divisions,
    this.onChanged,
    this.onChangeEnd,
    this.label,
    this.disabled = false,
    super.key,
  });

  String _formatValue(double value) {
    if (value == value.toInt()) {
      return value.toInt().toString();
    }
    return value.toStringAsFixed(1);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Label
        if (label != null) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label!,
                style: context.textTheme.labelLarge?.copyWith(
                  color: context.colorScheme.onSurface,
                ),
              ),
              Text(
                '${_formatValue(values.start)} - ${_formatValue(values.end)}',
                style: context.textTheme.labelMedium?.copyWith(
                  color: context.colorScheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ],
          ),
          SizedBox(height: context.spacing.sm.toDouble()),
        ],

        // Range slider
        RangeSlider(
          values: values,
          min: min,
          max: max,
          divisions: divisions,
          onChanged: disabled ? null : onChanged,
          onChangeEnd: onChangeEnd,
          activeColor: context.colorScheme.primary,
          inactiveColor: context.colorScheme.outline.withValues(alpha: 0.2),
          labels: RangeLabels(
            _formatValue(values.start),
            _formatValue(values.end),
          ),
        ),
      ],
    );
  }
}
