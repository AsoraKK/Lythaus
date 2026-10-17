import assert from 'node:assert/strict';
export const originalRunApp='runApp(const ProviderScope(child: LythausApp()));';
export const wrappedRunApp=`const diagnosticTextScale = int.fromEnvironment(
    'DIAGNOSTIC_TEXT_SCALE',
    defaultValue: 1,
  );
  runApp(
    ProviderScope(
      child: MediaQuery.withClampedTextScaling(
        minScaleFactor: diagnosticTextScale.toDouble(),
        maxScaleFactor: diagnosticTextScale.toDouble(),
        child: const LythausApp(),
      ),
    ),
  );`;
export function wrapProductionTextScale(source){
 assert.equal(source.split(originalRunApp).length,2,'Exactly one original production root is required');
 return source.replace(originalRunApp,wrappedRunApp);
}
