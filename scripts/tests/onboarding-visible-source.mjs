import {prepareBrandLoginSource} from './brand-login-source.mjs';
export const onboardingImport="import 'onboarding_visible_geometry.dart' as onboarding_geometry;\n";
export const visibleImport="import 'onboarding_visible_probe.dart' as visible_navigation;\n";
export const visibleInstall='  onboarding_geometry.installOnboardingGeometry();\n  visible_navigation.installVisibleOnboardingProbe();\n';
export const referenceInstall='  onboarding_geometry.installOnboardingGeometry();\n';
function addImport(source,statement){
 const end=source.indexOf(';',source.lastIndexOf('import '))+1;
 return source.slice(0,end)+'\n'+statement+source.slice(end);
}
export function prepareVisibleOnboardingSource(original){
 return addImport(addImport(prepareBrandLoginSource(original),onboardingImport),visibleImport)
  .replace('  const diagnosticTextScale =',visibleInstall+'  const diagnosticTextScale =');
}
export function prepareOnboardingReference(original){
 return addImport(original,onboardingImport).replace('void main() {\n','void main() {\n'+referenceInstall);
}
