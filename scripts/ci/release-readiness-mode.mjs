export function authenticatedAcceptanceFlagForRelease(ownerTestingDeployment) {
  return ownerTestingDeployment ? 'false' : 'true';
}
