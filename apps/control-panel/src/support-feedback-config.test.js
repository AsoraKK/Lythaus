import { describe, expect, it } from 'vitest';
import { isSupportFeedbackEnabled } from './support-feedback-config.js';

describe('support feedback feature gate', () => {
  it('fails closed unless the exact build flag is enabled', () => {
    expect(isSupportFeedbackEnabled(undefined)).toBe(false);
    expect(isSupportFeedbackEnabled('')).toBe(false);
    expect(isSupportFeedbackEnabled('True')).toBe(false);
    expect(isSupportFeedbackEnabled('true')).toBe(true);
  });
});
