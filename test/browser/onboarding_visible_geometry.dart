// On-demand layout observation only; never registers callbacks or requests frames.
// ignore_for_file: public_member_api_docs
import 'dart:convert';
import 'dart:js_interop';

import 'package:flutter/material.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';
import 'package:lythaus/features/auth/presentation/auth_choice_screen.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';

@JS('globalThis.__readOnboardingLayout')
external set layoutReader(JSFunction reader);

void installOnboardingGeometry() {
  layoutReader = (() {
    final screens = <Map<String, Object?>>[];
    var visibleAuthChoices = 0;
    Map<String, double>? bounds(Element element) {
      final render = element.findRenderObject();
      if (render is! RenderBox || !render.hasSize) return null;
      final origin = render.localToGlobal(Offset.zero);
      return {
        'x': origin.dx,
        'y': origin.dy,
        'width': render.size.width,
        'height': render.size.height,
      };
    }

    void visit(Element element) {
      final widget = element.widget;
      if (widget is Offstage && widget.offstage) return;
      if (widget is AuthChoiceScreen) visibleAuthChoices++;
      if (widget is OnboardingIntroScreen) {
        final media = element.getInheritedWidgetOfExactType<MediaQuery>()?.data;
        Brightness? brightness;
        element.visitAncestorElements((ancestor) {
          final widget = ancestor.widget;
          if (widget is Theme) {
            brightness = widget.data.brightness;
            return false;
          }
          return true;
        });
        final brands = <Map<String, double>>[];
        final texts = <String, Map<String, double>>{};
        void content(Element child) {
          final item = child.widget;
          final rect = bounds(child);
          if (rect != null && item is LythBrand && !item.decorative) {
            brands.add(rect);
          }
          if (rect != null && item is Text && item.data != null) {
            texts[item.data!] = rect;
          }
          child.visitChildElements(content);
        }

        element.visitChildElements(content);
        screens.add({
          'bounds': bounds(element),
          'brands': brands,
          'texts': texts,
          'scale': media == null ? null : media.textScaler.scale(14) / 14,
          'disableAnimations': media?.disableAnimations,
          'theme': brightness?.name,
        });
      }
      element.debugVisitOnstageChildren(visit);
    }

    final root = WidgetsBinding.instance.rootElement;
    if (root != null) visit(root);
    return jsonEncode({
      'screens': screens,
      'visibleAuthChoices': visibleAuthChoices,
      'semanticsEnabled': WidgetsBinding.instance.semanticsEnabled,
    }).toJS;
  }).toJS;
}
