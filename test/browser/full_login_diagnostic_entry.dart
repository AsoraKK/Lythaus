// Fixture-only observation: the original login widget tree is unchanged.
// ignore_for_file: public_member_api_docs
import 'dart:convert';
import 'dart:js_interop';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'approved_brand_entry.dart' as original;

@JS('globalThis.__fullLoginProbeEvent')
external JSFunction? get probeCallback;
void report(String name, [String detail = '']) =>
    probeCallback?.callAsFunction(null, name.toJS, detail.toJS);

final class ObservedPipelineOwner extends PipelineOwner {
  ObservedPipelineOwner()
    : super(onSemanticsUpdate: (_) => report('unexpectedRootSemanticsUpdate'));

  @override
  void flushLayout() {
    report('layout:start');
    super.flushLayout();
    report('layout:end');
  }

  @override
  void flushCompositingBits() {
    report('compositingBits:start');
    super.flushCompositingBits();
    report('compositingBits:end');
  }

  @override
  void flushPaint() {
    report('paintFlush:start');
    super.flushPaint();
    report('paintFlush:end');
  }

  @override
  void flushSemantics() {
    report('semanticsFlush:start');
    super.flushSemantics();
    report('semanticsFlush:end');
  }
}

class FullLoginProbeBinding extends WidgetsFlutterBinding {
  int observedFrames = 0;

  @override
  PipelineOwner createRootPipelineOwner() => ObservedPipelineOwner();

  @override
  void drawFrame() {
    report('frame:start');
    super.drawFrame();
    report('frame:end');
    if (++observedFrames <= 8) {
      final boxes = <Map<String, Object>>[];
      void visit(RenderObject object) {
        if (object is RenderBox && object.hasSize) {
          final offset = object.localToGlobal(Offset.zero);
          boxes.add({
            'type': object.runtimeType.toString(),
            'kind': object is RenderParagraph
                ? 'paragraph'
                : object is RenderEditable
                ? 'editable'
                : object is RenderCustomPaint
                ? 'customPaint'
                : object is RenderSemanticsAnnotations
                ? 'semantics'
                : 'box',
            'x': offset.dx,
            'y': offset.dy,
            'width': object.size.width,
            'height': object.size.height,
            if (object is RenderParagraph) 'text': object.text.toPlainText(),
          });
        }
        object.visitChildren(visit);
      }

      for (final view in renderViews) {
        view.visitChildren(visit);
      }
      report('renderBoxes', jsonEncode(boxes));
    }
  }
}

void main() {
  FullLoginProbeBinding();
  original.main();
}
