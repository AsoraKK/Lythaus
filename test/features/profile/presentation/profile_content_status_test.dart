import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/profile/presentation/profile_content_status.dart';

void main() {
  testWidgets('status announces loading and supports keyboard retry at 200%', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    var retries = 0;
    Widget app(Widget state) => MaterialApp(
      home: MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: Scaffold(body: ListView(children: [state])),
      ),
    );
    await tester.pumpWidget(
      app(
        const ProfileContentStatus(
          title: 'Loading your comments',
          icon: Icons.chat_bubble_outline,
          loading: true,
        ),
      ),
    );
    await tester.pump();
    final loading = tester.getSemantics(find.byType(ProfileContentStatus));
    expect(loading.getSemanticsData().flagsCollection.isLiveRegion, isTrue);
    expect(find.text('Loading your comments'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(
      app(
        ProfileContentStatus(
          title: 'Comments could not be loaded',
          icon: Icons.chat_bubble_outline,
          message: 'You appear to be offline. Connect to load your comments.',
          retryLabel: 'Retry comments',
          onRetry: () => retries++,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Retry comments'));
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(retries, 1);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(
      app(
        const ProfileContentStatus(
          title: 'No comments to show',
          icon: Icons.chat_bubble_outline,
          message: 'No comments are available in this list.',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('No comments to show'), findsOneWidget);
    expect(find.text('Retry comments'), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
    expect(
      tester
          .getSemantics(find.byType(ProfileContentStatus))
          .getSemanticsData()
          .flagsCollection
          .isLiveRegion,
      isTrue,
    );
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
