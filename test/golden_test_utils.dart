// Golden test utilities - font loading and deterministic rendering for visual testing
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

/// Standard surface size for golden tests - ensures consistent rendering across environments
const Size kGoldenTestSurfaceSize = Size(400, 300);

/// Tolerant golden file comparator that allows minor pixel differences
/// across platforms (local dev vs CI runner) caused by font rendering,
/// anti-aliasing, and text shaping engine differences.
class TolerantGoldenFileComparator extends LocalFileComparator {
  /// [testFile] should be the URI of the calling test file (used to resolve
  /// relative golden paths).  [tolerance] is the maximum fraction of differing
  /// pixels allowed (0.0 – 1.0).
  TolerantGoldenFileComparator(super.testFile, {this.tolerance = 0.15});

  final double tolerance;

  @override
  Future<bool> compare(Uint8List imageBytes, Uri golden) async {
    final result = await GoldenFileComparator.compareLists(
      imageBytes,
      await getGoldenBytes(golden),
    );

    try {
      if (result.passed || result.diffPercent <= tolerance) {
        return true;
      }
      final error = await generateFailureOutput(result, golden, basedir);
      throw FlutterError(error);
    } finally {
      result.dispose();
    }
  }
}

/// Configures fonts and rendering for deterministic golden tests.
///
/// Must be called in setUpAll() before any golden tests run.
/// This ensures consistent font rendering across local and CI environments by:
/// 1. Disabling runtime font fetching (ensures bundled fonts are used)
/// 2. Loading bundled Manrope font files into the test framework
/// 3. Setting up deterministic text rendering
Future<void> loadFontsForGoldenTests() async {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Install tolerant comparator to handle cross-platform rendering differences.
  // At this point goldenFileComparator is a LocalFileComparator whose basedir
  // points to the calling test file's directory, so we must preserve that path.
  if (goldenFileComparator is LocalFileComparator) {
    final current = goldenFileComparator as LocalFileComparator;
    // basedir is already the directory URI; append a dummy file name so the
    // constructor's resolve('.') produces the same directory.
    final testFileUri = current.basedir.resolve('test_file.dart');
    goldenFileComparator = TolerantGoldenFileComparator(testFileUri);
  }

  // Disable Google Fonts network fetching - forces use of bundled asset fonts
  GoogleFonts.config.allowRuntimeFetching = false;

  // Load bundled Manrope font family for consistent rendering
  final fontLoader = FontLoader('Manrope');
  final fontWeights = ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold'];

  for (final weight in fontWeights) {
    final fontData = await rootBundle.load('assets/fonts/Manrope-$weight.ttf');
    fontLoader.addFont(Future.value(fontData));
  }
  await fontLoader.load();

  // Also load as the default Material font for Flutter's text rendering
  final robotoLoader = FontLoader('Roboto');
  // Use Manrope-Regular as fallback for Roboto to ensure consistency
  final robotoData = await rootBundle.load('assets/fonts/Manrope-Regular.ttf');
  robotoLoader.addFont(Future.value(robotoData));
  await robotoLoader.load();
}

/// Wraps a widget with deterministic rendering settings for golden tests.
///
/// Use this in golden tests to ensure:
/// - Fixed device pixel ratio (1.0)
/// - Fixed text scale factor (1.0)
/// - Consistent platform brightness
/// - Fixed surface size
Widget goldenTestWrapper({
  required Widget child,
  ThemeData? theme,
  Size surfaceSize = kGoldenTestSurfaceSize,
}) {
  return MediaQuery(
    data: const MediaQueryData(
      size: kGoldenTestSurfaceSize,
      devicePixelRatio: 1.0,
      textScaler: TextScaler.noScaling,
      platformBrightness: Brightness.light,
    ),
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: theme,
      home: Scaffold(body: Center(child: child)),
    ),
  );
}

/// Pumps a golden test widget with deterministic settings.
///
/// This is the recommended way to set up widgets for golden testing.
/// It ensures:
/// - Consistent surface size across platforms
/// - Fixed DPR and text scaling
/// - Proper font loading
Future<void> pumpGoldenWidget(
  WidgetTester tester, {
  required Widget child,
  ThemeData? theme,
  Size surfaceSize = kGoldenTestSurfaceSize,
}) async {
  // Set a fixed surface size for deterministic rendering
  await tester.binding.setSurfaceSize(surfaceSize);

  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(
        size: surfaceSize,
        devicePixelRatio: 1.0,
        textScaler: TextScaler.noScaling,
        platformBrightness: theme?.brightness == Brightness.dark
            ? Brightness.dark
            : Brightness.light,
      ),
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: theme,
        home: Scaffold(
          backgroundColor: theme?.colorScheme.surface,
          body: Center(child: child),
        ),
      ),
    ),
  );

  // Allow time for fonts and images to load
  await tester.pump(const Duration(milliseconds: 100));
}

/// Resets the surface size after golden tests.
///
/// Call this in tearDown or tearDownAll to restore default behavior.
Future<void> resetGoldenTestSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(null);
}
