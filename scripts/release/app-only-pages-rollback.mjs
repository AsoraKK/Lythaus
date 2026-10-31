import { isDeepStrictEqual } from 'node:util';
import { assertAppPagesBaselineUnchanged, assertAppPagesCandidateBound } from './app-only-eligibility.mjs';

/**
 * Scoped rollback orchestration. A protected caller must hold the shared Pages
 * and Worker deployment locks throughout, obtain `readCurrent` from the fixed
 * authenticated Pages capture, and bind `restore` to the existing Pages
 * rollback helper. This function does not itself contact any provider.
 */
export async function rollbackAppPages({ before, candidate, releaseSha, readCurrent, restore,
  verifyBaseline,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (typeof readCurrent !== 'function' || typeof restore !== 'function' || typeof delay !== 'function') {
    throw new Error('app Pages rollback dependencies are missing');
  }
  const current = await readCurrent();
  if (isDeepStrictEqual(before, current)) {
    assertAppPagesBaselineUnchanged(before, current);
    if (verifyBaseline) await verifyBaseline(current);
    return Object.freeze({ status: 'BASELINE_UNCHANGED', before });
  }
  if (!candidate) throw new Error('app Pages rollback candidate is not bound');
  assertAppPagesCandidateBound(before, candidate, current, releaseSha);
  try {
    await restore({ before, candidate });
  } catch {
    // A failed response may follow an applied request. Never repeat the write.
    throw new Error('app Pages rollback outcome is uncertain; inspect provider state');
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const restored = await readCurrent();
    if (isDeepStrictEqual(before, restored)) {
      assertAppPagesBaselineUnchanged(before, restored);
      if (verifyBaseline) await verifyBaseline(restored);
      return Object.freeze({ status: 'ROLLED_BACK_PROVIDER_READBACK', before, restored });
    }
    // An unrelated or ambiguous deployment must not be overwritten or accepted.
    assertAppPagesCandidateBound(before, candidate, restored, releaseSha);
    if (attempt < 5) await delay(2000);
  }
  throw new Error('app Pages rollback provider readback is unverified');
}
