export function isSupportFeedbackEnabled(value) {
  return value === 'true';
}

export function supportFeedbackEnabled() {
  return isSupportFeedbackEnabled(import.meta.env.VITE_SUPPORT_FEEDBACK_ENABLED);
}
