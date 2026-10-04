/// Whether member support feedback is enabled in this build.
const bool supportFeedbackEnabled = bool.fromEnvironment(
  'LYTHAUS_SUPPORT_FEEDBACK_ENABLED',
  defaultValue: false,
);
