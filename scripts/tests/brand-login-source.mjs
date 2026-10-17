import {wrapProductionTextScale} from './full-login-scale-source.mjs';
export const geometryImport="import '../test/browser/brand_login_geometry.dart' as login_geometry;\n";
export const geometryInstall='login_geometry.installBrandLoginGeometry();\n  ';
export function prepareBrandLoginSource(source){
 const wrapped=wrapProductionTextScale(source);
 const lastImport=wrapped.lastIndexOf('import '),end=wrapped.indexOf(';',lastImport)+1;
 return (wrapped.slice(0,end)+'\n'+geometryImport+wrapped.slice(end))
  .replace('const diagnosticTextScale =',geometryInstall+'const diagnosticTextScale =');
}
