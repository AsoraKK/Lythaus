import assert from 'node:assert/strict';
import {wrapProductionTextScale} from './full-login-scale-source.mjs';

export const staticGeometryImport="import 'onboarding_lifecycle_geometry.dart' as observation;\n";
export const productionGeometryImport=staticGeometryImport;
export const hostImport="import 'onboarding_lifecycle_host.dart';\n";
export const install='  observation.installOnboardingGeometry();\n';
export const hostBuilder='        builder: (context, child) => OnboardingLifecycleHost(child: child!),\n';
export function addImport(source,statement){
 const end=source.indexOf(';',source.lastIndexOf('import '))+1;
 return source.slice(0,end)+'\n'+statement+source.slice(end);
}
export function prepareStaticOnboarding(source,hosted=false){
 let result=addImport(source,staticGeometryImport).replace('void main() {\n','void main() {\n'+install);
 if(hosted){
  result=addImport(result,hostImport);
  assert.equal(result.split('          child: child!,').length,2);
  result=result.replace('          child: child!,','          child: OnboardingLifecycleHost(child: child!),');
 }
 return result;
}
export function prepareProductionOnboarding(source){
 let result=wrapProductionTextScale(source);
 result=addImport(addImport(result,productionGeometryImport),hostImport);
 assert.equal(result.split('  const diagnosticTextScale =').length,2);
 result=result.replace('  const diagnosticTextScale =',install+'  const diagnosticTextScale =');
 assert.equal(result.split('        routerConfig: router,\n').length,2);
 return result.replace('        routerConfig: router,\n','        routerConfig: router,\n'+hostBuilder);
}
