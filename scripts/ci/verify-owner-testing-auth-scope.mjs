import { pathToFileURL } from 'node:url';

export function verifyOwnerTestingAuthScope(environment) {
  if (environment.OWNER_TESTING_DEPLOYMENT !== 'true') return { status:'NOT_APPLICABLE' };
  if (environment.AUTHENTICITY_BETA_RELEASE_RECEIPT_PRESENT !== 'false') {
    throw new Error('owner_testing_requires_confirmed_absence_of_authenticity_release_receipt');
  }
  return { status:'VERIFIED', ownerTesting:true, authenticityReleaseReceiptPresent:false,
    infrastructureMode:'verify_existing', scopedKeyMode:'preserve_only' };
}

export function assertOwnerTestingScopedKeys(lifecycle, ownerTesting) {
  if (!ownerTesting) return;
  if (lifecycle.transactionalEmail.action !== 'preserve' || lifecycle.acceptanceState.action !== 'reuse_not_touched') {
    throw new Error('owner_testing_requires_existing_email_keys_and_deferred_coordinator');
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(verifyOwnerTestingAuthScope(process.env)));
}
