// ignore_for_file: public_member_api_docs

/// Lythaus Text Input Component
///
/// High-level text input field using design system tokens.
/// All styling must use tokens from the design system.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Size variants for text inputs
enum LythTextInputSize {
  medium(height: 48, contentPadding: 12),
  large(height: 52, contentPadding: 16);

  final double height;
  final double contentPadding;

  const LythTextInputSize({required this.height, required this.contentPadding});
}

/// Semantic text input component
///
/// High-level wrapper around TextField providing consistent styling using design tokens.
/// Supports error states, icons, and helper text.
///
/// All styling (padding, border radius, colors) comes from the design system.
/// Do not add hardcoded colors, spacing, or border radius.
///
/// Usage:
/// ```dart
/// LythTextInput(
///   label: 'Email',
///   placeholder: 'you@example.com',
///   onChanged: (value) {},
///   prefixIcon: Icons.email,
/// )
///
/// LythTextInput.password(
///   label: 'Password',
///   onChanged: (value) {},
/// )
/// ```
class LythTextInput extends StatefulWidget {
  /// Input label
  final String? label;

  /// Placeholder text
  final String? placeholder;

  /// Current input value
  final String? value;

  /// Callback when value changes
  final ValueChanged<String>? onChanged;

  /// Callback when submitted
  final VoidCallback? onSubmitted;

  /// Input size
  final LythTextInputSize size;

  /// Leading icon
  final IconData? prefixIcon;

  /// Trailing icon
  final IconData? suffixIcon;

  /// Trailing icon callback
  final VoidCallback? suffixIconOnPressed;

  /// Helper text below input
  final String? helperText;

  /// Error text (shows error state)
  final String? errorText;

  /// Whether input is disabled
  final bool disabled;

  /// Text input type
  final TextInputType keyboardType;

  /// Max lines (null = multiline)
  final int? maxLines;

  /// Max length (null = unlimited)
  final int? maxLength;

  /// Whether to obscure text (password field)
  final bool obscureText;

  /// Custom input controller
  final TextEditingController? controller;

  /// Focus node
  final FocusNode? focusNode;

  /// Text input action
  final TextInputAction? textInputAction;

  const LythTextInput({
    this.label,
    this.placeholder,
    this.value,
    this.onChanged,
    this.onSubmitted,
    this.size = LythTextInputSize.medium,
    this.prefixIcon,
    this.suffixIcon,
    this.suffixIconOnPressed,
    this.helperText,
    this.errorText,
    this.disabled = false,
    this.keyboardType = TextInputType.text,
    this.maxLines = 1,
    this.maxLength,
    this.obscureText = false,
    this.controller,
    this.focusNode,
    this.textInputAction,
    super.key,
  });

  /// Create a password input field
  const LythTextInput.password({
    required this.label,
    this.placeholder,
    required this.onChanged,
    this.onSubmitted,
    this.size = LythTextInputSize.medium,
    this.helperText,
    this.errorText,
    this.disabled = false,
    this.controller,
    this.focusNode,
    super.key,
  }) : value = null,
       prefixIcon = Icons.lock,
       suffixIcon = null,
       suffixIconOnPressed = null,
       keyboardType = TextInputType.visiblePassword,
       maxLines = 1,
       maxLength = null,
       obscureText = true,
       textInputAction = null;

  /// Create an email input field
  const LythTextInput.email({
    required this.label,
    this.placeholder,
    required this.onChanged,
    this.onSubmitted,
    this.size = LythTextInputSize.medium,
    this.helperText,
    this.errorText,
    this.disabled = false,
    this.controller,
    this.focusNode,
    super.key,
  }) : value = null,
       prefixIcon = Icons.email,
       suffixIcon = null,
       suffixIconOnPressed = null,
       keyboardType = TextInputType.emailAddress,
       maxLines = 1,
       maxLength = null,
       obscureText = false,
       textInputAction = TextInputAction.next;

  @override
  State<LythTextInput> createState() => _LythTextInputState();
}

class _LythTextInputState extends State<LythTextInput> {
  late TextEditingController _controller;
  late FocusNode _focusNode;
  bool _passwordVisible = false;

  @override
  void initState() {
    super.initState();
    _controller =
        widget.controller ?? TextEditingController(text: widget.value);
    _focusNode = widget.focusNode ?? FocusNode();
  }

  @override
  void didUpdateWidget(LythTextInput oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != null && widget.value != _controller.text) {
      _controller.text = widget.value!;
    }
  }

  @override
  void dispose() {
    if (widget.controller == null) {
      _controller.dispose();
    }
    if (widget.focusNode == null) {
      _focusNode.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hasError = widget.errorText != null && widget.errorText!.isNotEmpty;
    return ConstrainedBox(
      constraints: BoxConstraints(minHeight: widget.size.height),
      child: TextField(
        controller: _controller,
        focusNode: _focusNode,
        enabled: !widget.disabled,
        onChanged: widget.onChanged,
        onSubmitted: widget.onSubmitted == null
            ? null
            : (_) => widget.onSubmitted!(),
        textInputAction: widget.textInputAction,
        keyboardType: widget.keyboardType,
        obscureText: widget.obscureText && !_passwordVisible,
        autocorrect: !widget.obscureText,
        enableSuggestions: !widget.obscureText,
        autofillHints: widget.keyboardType == TextInputType.emailAddress
            ? const [AutofillHints.email]
            : widget.obscureText
            ? const [AutofillHints.password]
            : null,
        maxLines: widget.maxLines,
        maxLength: widget.maxLength,
        style: context.textTheme.bodyLarge,
        decoration: InputDecoration(
          labelText: widget.label,
          floatingLabelBehavior: FloatingLabelBehavior.always,
          hintText: widget.placeholder,
          helperText: hasError ? null : widget.helperText,
          errorText: hasError ? widget.errorText : null,
          prefixIcon: widget.prefixIcon == null
              ? null
              : Icon(widget.prefixIcon),
          suffixIcon: widget.suffixIcon != null
              ? IconButton(
                  icon: Icon(widget.suffixIcon),
                  onPressed: widget.disabled
                      ? null
                      : widget.suffixIconOnPressed,
                )
              : widget.obscureText
              ? IconButton(
                  tooltip: _passwordVisible ? 'Hide password' : 'Show password',
                  icon: Icon(
                    _passwordVisible ? Icons.visibility_off : Icons.visibility,
                  ),
                  onPressed: widget.disabled
                      ? null
                      : () => setState(
                          () => _passwordVisible = !_passwordVisible,
                        ),
                )
              : null,
          contentPadding: EdgeInsets.all(widget.size.contentPadding),
        ),
      ),
    );
  }
}
