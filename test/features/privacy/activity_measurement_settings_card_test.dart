import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/analytics/activity_measurement_client.dart';
import 'package:lythaus/core/analytics/activity_measurement_providers.dart';
import 'package:lythaus/features/privacy/widgets/activity_measurement_settings_card.dart';
import '../../core/analytics/activity_measurement_fixture.dart';

Widget _harness(
  PilotClient client, {
  bool enabled = false,
  bool dark = false,
  double scale = 1,
}) => ProviderScope(
  overrides: [
    activityMeasurementControllerProvider.overrideWith(
      (ref) => ActivityMeasurementController(
        client: client,
        collectionEnabled: enabled,
      ),
    ),
  ],
  child: MaterialApp(
    theme: ThemeData(brightness: dark ? Brightness.dark : Brightness.light),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    home: const Scaffold(
      body: SingleChildScrollView(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: ActivityMeasurementSettingsCard(),
        ),
      ),
    ),
  ),
);

void main() {
  testWidgets(
    'default-disabled pilot shows exact notice and unknown consent, without automatic read',
    (tester) async {
      final client = PilotClient();
      await tester.pumpWidget(_harness(client));
      await tester.pumpAndSettle();
      expect(find.text(activityMeasurementNotice), findsOneWidget);
      expect(
        find.text('Pilot consent status has not been confirmed.'),
        findsOneWidget,
      );
      expect(find.byType(Switch), findsNothing);
      expect(client.reads, 0);
      await tester.tap(find.text('Review existing pilot consent'));
      await tester.pumpAndSettle();
      expect(client.reads, 1);
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      expect(client.choices, [false]);
    },
  );

  for (final dark in [false, true]) {
    testWidgets(
      'pilot consent reflows at 320px and 200% text, actual dark=$dark',
      (tester) async {
        tester.view.physicalSize = const Size(320, 1200);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final client = PilotClient();
        await tester.pumpWidget(
          _harness(client, enabled: true, dark: dark, scale: 2),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text(activityMeasurementNotice), findsOneWidget);
        expect(find.byType(Switch), findsOneWidget);
        expect(
          Theme.of(
            tester.element(find.byType(ActivityMeasurementSettingsCard)),
          ).brightness,
          dark ? Brightness.dark : Brightness.light,
        );
      },
    );
  }
}
