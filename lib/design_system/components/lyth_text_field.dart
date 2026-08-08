/// Lythaus Text Field Component
///
/// Semantic wrapper around LythTextInput to match the design system API.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/components/lyth_text_input.dart';

/// Semantic text field component for user input with validation and theming support.
class LythTextField extends FormField<String> {
  /// Creates a [LythTextField].
  LythTextField({
    String? label,
    String? placeholder,
    String? value,
    String? initialValue,
    ValueChanged<String>? onChanged,
    VoidCallback? onSubmitted,
    LythTextInputSize size = LythTextInputSize.medium,
    IconData? prefixIcon,
    IconData? suffixIcon,
    VoidCallback? suffixIconOnPressed,
    String? helperText,
    String? errorText,
    bool disabled = false,
    TextInputType keyboardType = TextInputType.text,
    int? maxLines = 1,
    int? maxLength,
    bool obscureText = false,
    TextEditingController? controller,
    FocusNode? focusNode,
    TextInputAction? textInputAction,
    super.validator,
    super.autovalidateMode,
    super.key,
  }) : super(
         initialValue: controller?.text ?? value ?? initialValue,
         builder: (field) {
           return LythTextInput(
             label: label,
             placeholder: placeholder,
             value: field.value,
             onChanged: (next) {
               field.didChange(next);
               onChanged?.call(next);
             },
             onSubmitted: onSubmitted,
             size: size,
             prefixIcon: prefixIcon,
             suffixIcon: suffixIcon,
             suffixIconOnPressed: suffixIconOnPressed,
             helperText: helperText,
             errorText: field.errorText ?? errorText,
             disabled: disabled,
             keyboardType: keyboardType,
             maxLines: maxLines,
             maxLength: maxLength,
             obscureText: obscureText,
             controller: controller,
             focusNode: focusNode,
             textInputAction: textInputAction,
           );
         },
       );

  /// Creates a password text field variant with password visibility controls.
  factory LythTextField.password({
    required String label,
    String? placeholder,
    required ValueChanged<String> onChanged,
    VoidCallback? onSubmitted,
    LythTextInputSize size = LythTextInputSize.medium,
    String? helperText,
    String? errorText,
    bool disabled = false,
    TextEditingController? controller,
    FocusNode? focusNode,
    FormFieldValidator<String>? validator,
    AutovalidateMode? autovalidateMode,
    Key? key,
  }) {
    return LythTextField(
      key: key,
      label: label,
      placeholder: placeholder,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      size: size,
      prefixIcon: Icons.lock,
      helperText: helperText,
      errorText: errorText,
      disabled: disabled,
      keyboardType: TextInputType.visiblePassword,
      maxLines: 1,
      obscureText: true,
      controller: controller,
      focusNode: focusNode,
      textInputAction: null,
      validator: validator,
      autovalidateMode: autovalidateMode,
    );
  }

  /// Creates an email text field variant with email keyboard and validation.
  factory LythTextField.email({
    required String label,
    String? placeholder,
    required ValueChanged<String> onChanged,
    VoidCallback? onSubmitted,
    LythTextInputSize size = LythTextInputSize.medium,
    String? helperText,
    String? errorText,
    bool disabled = false,
    TextEditingController? controller,
    FocusNode? focusNode,
    FormFieldValidator<String>? validator,
    AutovalidateMode? autovalidateMode,
    Key? key,
  }) {
    return LythTextField(
      key: key,
      label: label,
      placeholder: placeholder,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      size: size,
      prefixIcon: Icons.email,
      helperText: helperText,
      errorText: errorText,
      disabled: disabled,
      keyboardType: TextInputType.emailAddress,
      maxLines: 1,
      obscureText: false,
      controller: controller,
      focusNode: focusNode,
      textInputAction: TextInputAction.next,
      validator: validator,
      autovalidateMode: autovalidateMode,
    );
  }
}
