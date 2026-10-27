// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

class LythSemanticColors {
  static const canvas = Color(0xFF242321);
  static const surface = Color(0xFF302E2B);
  static const text = Color(0xFFF5F3EE);
  static const accent = Color(0xFFEFC58D);
  static const clear = Color(0x00242321);
  static const danger = accent;
  static const success = accent;
  static const warning = accent;
  static const info = accent;
  static const onAccent = canvas;

  static const dark = <String, Color>{
    'canvas': canvas,
    'surface': surface,
    'surfaceRaised': surface,
    'text': text,
    'secondary': text,
    'muted': text,
    'accent': accent,
    'onAccent': canvas,
    'selection': surface,
    'onSelection': accent,
    'border': surface,
    'control': text,
    'focus': accent,
    'danger': accent,
    'onDanger': canvas,
    'dangerSurface': surface,
    'success': accent,
    'successSurface': surface,
    'warning': accent,
    'warningSurface': surface,
    'info': accent,
    'infoSurface': surface,
  };

  static const light = dark;

  static Map<String, Color> of(Brightness brightness) => dark;
}
