// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

class LythSemanticColors {
  static const light = <String, Color>{
    'canvas': Color(0xFFF7F4EC),
    'surface': Color(0xFFFFFCF5),
    'surfaceRaised': Color(0xFFEFEAE0),
    'text': Color(0xFF27241F),
    'secondary': Color(0xFF565148),
    'muted': Color(0xFF6C655B),
    'accent': Color(0xFF80551F),
    'onAccent': Color(0xFFFFFCF5),
    'selection': Color(0xFFF6E4C7),
    'onSelection': Color(0xFF48300E),
    'border': Color(0xFFD8D0C3),
    'control': Color(0xFF80766A),
    'focus': Color(0xFF80551F),
    'danger': Color(0xFFA3322B),
    'onDanger': Color(0xFFFFFFFF),
    'dangerSurface': Color(0xFFFCE4E0),
    'success': Color(0xFF286444),
    'successSurface': Color(0xFFE1EFE4),
    'warning': Color(0xFF805C13),
    'warningSurface': Color(0xFFF6EDCF),
    'info': Color(0xFF315C83),
    'infoSurface': Color(0xFFE1EDF6),
  };

  static const dark = <String, Color>{
    'canvas': Color(0xFF070706),
    'surface': Color(0xFF141411),
    'surfaceRaised': Color(0xFF201F1A),
    'text': Color(0xFFF2EEE3),
    'secondary': Color(0xFFC9C3B7),
    'muted': Color(0xFFA09A8F),
    'accent': Color(0xFFF2C98D),
    'onAccent': Color(0xFF30220F),
    'selection': Color(0xFF3A2C17),
    'onSelection': Color(0xFFF2C98D),
    'border': Color(0xFF35322B),
    'control': Color(0xFF898175),
    'focus': Color(0xFFF2C98D),
    'danger': Color(0xFFFFB4AB),
    'onDanger': Color(0xFF601410),
    'dangerSurface': Color(0xFF3E211F),
    'success': Color(0xFF96D5AE),
    'successSurface': Color(0xFF193525),
    'warning': Color(0xFFE7C479),
    'warningSurface': Color(0xFF392F18),
    'info': Color(0xFFA8CCE9),
    'infoSurface': Color(0xFF1C3040),
  };

  static Map<String, Color> of(Brightness brightness) =>
      brightness == Brightness.dark ? dark : light;
}
