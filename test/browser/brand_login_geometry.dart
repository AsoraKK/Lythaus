// Read-only browser-fixture access to fractional layout; never requests a frame.
// ignore_for_file: public_member_api_docs
import 'dart:convert';
import 'dart:js_interop';

import 'package:flutter/material.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';

@JS('globalThis.__readBrandLoginLayout')
external set layoutReader(JSFunction reader);

void installBrandLoginGeometry() {
  layoutReader = (() {
    final brands = <Map<String, double>>[];
    final fields = <String, List<Map<String, double>>>{};
    final scales = <double>[];
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
      if (widget is LythBrand && !widget.decorative) {
        final box = bounds(element);
        if (box != null) brands.add(box);
        final media = element.getInheritedWidgetOfExactType<MediaQuery>();
        if (media != null) scales.add(media.data.textScaler.scale(14) / 14);
      }
      if (widget is TextField) {
        final label = widget.decoration?.labelText;
        final box = bounds(element);
        if (label != null && box != null) {
          fields.putIfAbsent(label, () => []).add(box);
        }
      }
      element.visitChildElements(visit);
    }

    final root = WidgetsBinding.instance.rootElement;
    if (root != null) visit(root);
    return jsonEncode({
      'brands': brands,
      'fields': fields,
      'scales': scales,
      'semanticsEnabled': WidgetsBinding.instance.semanticsEnabled,
    }).toJS;
  }).toJS;
}
