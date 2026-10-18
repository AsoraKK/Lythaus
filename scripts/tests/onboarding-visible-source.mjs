import {prepareBrandLoginSource} from './brand-login-source.mjs';
import {addImport} from './onboarding-lifecycle-source.mjs';
export const onboardingImport="import 'onboarding_lifecycle_geometry.dart' as onboarding_geometry;\n";
export const visibleImport="import 'onboarding_visible_probe.dart' as visible_navigation;\n";
export const visibleInstall='  onboarding_geometry.installOnboardingGeometry();\n  visible_navigation.installVisibleOnboardingProbe();\n';
export function prepareVisibleOnboardingSource(original){
 const login=prepareBrandLoginSource(original);
 return addImport(addImport(login,onboardingImport),visibleImport)
  .replace('  const diagnosticTextScale =',visibleInstall+'  const diagnosticTextScale =');
}
