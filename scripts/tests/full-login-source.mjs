import assert from 'node:assert/strict';
export const artworkCall='approvedBrandPaths[asset]!(canvas);';
export const neutralCall=`canvas.drawRect(bounds, Paint()..color = const Color(0xff808080));
    canvas.drawRect(Rect.fromLTWH(bounds.center.dx, bounds.top, bounds.width / 2, bounds.height), Paint()..color = const Color(0xffc0c0c0));`;

export function observeFullLoginBrand(source, neutral=false) {
  assert.equal(source.split(artworkCall).length,2,'Expected exactly one production artwork call');
  const observation="_fullLoginProbeEvent?.callAsFunction(null, 'brand:paint'.toJS, size.width.toJS, size.height.toJS);";
  const imported="import 'dart:js_interop';\n@JS('globalThis.__fullLoginProbeEvent')\nexternal JSFunction? get _fullLoginProbeEvent;\n";
  // Imports must precede declarations. Insert the fixture-only callback after
  // the final existing import; no production source is changed by this helper.
  const lastImport=source.lastIndexOf('import '), end=source.indexOf(';',lastImport)+1;
  const result=source.slice(0,end)+'\n'+imported+source.slice(end);
  return result.replace(artworkCall,observation+'\n    '+(neutral?neutralCall:artworkCall));
}
