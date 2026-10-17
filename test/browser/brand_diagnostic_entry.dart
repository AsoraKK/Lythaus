// Synthetic rendering controls; never a production entrypoint.
// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'dart:js_interop';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';
import 'package:lythaus/design_system/widgets/approved_brand_paths.g.dart';

const asset = 'assets/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg';
final noBrand = Uri.base.queryParameters['noBrand'] == '1';
@JS('globalThis.__recordFlutterProbe')
external JSFunction? get probeCallback;
void report(String name, [JSAny? value]) =>
    probeCallback?.callAsFunction(null, name.toJS, value ?? 1.toJS);
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  WidgetsBinding.instance.addPersistentFrameCallback((_) => report('frame'));
  runApp(
    MaterialApp(
      home: Scaffold(
        backgroundColor: Colors.white,
        body: Padding(
          padding: const EdgeInsets.only(top: 100),
          child: Wrap(
            children: [
              tile('rectangle', const ColoredBox(color: Color(0xff00aa44))),
              tile(
                'text',
                const Text(
                  'FLUTTER LIVE',
                  style: TextStyle(color: Colors.black, fontSize: 25),
                ),
              ),
              if (!noBrand) ...[
                tile('direct-brand', CustomPaint(painter: DirectControl())),
                tile('production-brand', const LythBrand(height: 50)),
                tile('svg', SvgPicture.asset(asset)),
                tile('image', const DiagnosticImage()),
              ],
            ],
          ),
        ),
      ),
    ),
  );
}

Widget tile(String name, Widget child) => SizedBox(
  width: 300,
  height: 130,
  child: Column(
    children: [
      Text(name),
      const SizedBox(height: 12),
      Semantics(
        label: 'diagnostic-$name',
        image: true,
        excludeSemantics: true,
        child: SizedBox(
          width: 240,
          height: 60,
          child: CustomPaint(
            foregroundPainter: PaintObservation(name),
            child: child,
          ),
        ),
      ),
    ],
  ),
);

class PaintObservation extends CustomPainter {
  const PaintObservation(this.name);
  final String name;
  @override
  void paint(Canvas canvas, Size size) => report('paint:$name');
  @override
  bool shouldRepaint(PaintObservation oldDelegate) => oldDelegate.name != name;
}

class DiagnosticImage extends StatefulWidget {
  const DiagnosticImage({super.key});
  @override
  State<DiagnosticImage> createState() => _DiagnosticImageState();
}

class _DiagnosticImageState extends State<DiagnosticImage> {
  final provider = const NetworkImage('icons/Icon-192.png');
  ImageStream? stream;
  late final listener = ImageStreamListener(
    (image, synchronous) => report('imageDecoded', image.image.width.toJS),
    onError: (Object error, StackTrace? stack) =>
        report('imageError', error.toString().toJS),
  );
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (stream == null) {
      stream = provider.resolve(createLocalImageConfiguration(context));
      stream!.addListener(listener);
    }
  }

  @override
  void dispose() {
    stream?.removeListener(listener);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Image(
    image: provider,
    fit: BoxFit.contain,
    frameBuilder: (context, child, frame, synchronous) {
      if (frame != null) report('imageFrameReady', frame.toJS);
      return child;
    },
    errorBuilder: (context, error, stack) {
      report('imageError', error.toString().toJS);
      return const SizedBox.shrink();
    },
  );
}

class DirectControl extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const file = 'lythaus-wordmark-black.e450176663e0.svg';
    final bounds = approvedBrandViewBoxes[file]!;
    final scale = size.height / bounds.height;
    canvas.save();
    canvas.translate((size.width - bounds.width * scale) / 2, 0);
    canvas.scale(scale);
    canvas.translate(-bounds.left, -bounds.top);
    approvedBrandPaths[file]!(canvas);
    canvas.restore();
  }

  @override
  bool shouldRepaint(DirectControl oldDelegate) => false;
}
