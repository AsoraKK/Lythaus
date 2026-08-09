import { ECO_TRAIN_CONFIG } from './config.mjs';
import { telemetryAction } from './controller.mjs';

export const QUALIFICATION_STAGES = Object.freeze([
  { name: 'A', targetUtilisationPercent: 25, durationSeconds: 5 * 60 },
  { name: 'B', targetUtilisationPercent: 35, durationSeconds: 10 * 60 },
  { name: 'C', targetUtilisationPercent: 40, durationSeconds: 15 * 60 },
]);

export function qualificationPlan(config = ECO_TRAIN_CONFIG) {
  return QUALIFICATION_STAGES.map((stage) => ({ ...stage, pauseC: config.thermal.pause_c, emergencyStopC: config.thermal.emergency_stop_c }));
}

export function recordQualificationSample(sample, config = ECO_TRAIN_CONFIG) {
  const action = telemetryAction(sample.temperature, config);
  return {
    timestamp: sample.timestamp,
    cpuUtilisationPercent: sample.cpuUtilisationPercent,
    temperatureC: sample.temperature.celsius,
    temperatureState: sample.temperature.state,
    memoryGb: sample.memoryGb ?? null,
    processMemoryGb: sample.processMemoryGb ?? null,
    clockMhz: sample.clockMhz ?? null,
    thermalThrottling: sample.thermalThrottling ?? null,
    action: action.action,
    reason: action.reason,
  };
}

export function qualificationStatus(records, config = ECO_TRAIN_CONFIG) {
  if (records.some((record) => record.action === 'EMERGENCY_STOP')) return 'ABORTED_EMERGENCY_STOP';
  if (records.some((record) => record.temperatureState !== 'VALID')) return 'FAILED_NO_VALID_TELEMETRY';
  if (records.some((record) => record.action === 'PAUSE')) return 'PAUSED_THERMAL_LIMIT';
  return 'READY_FOR_HUMAN_REVIEW';
}

export function buildQualificationReport(records, config = ECO_TRAIN_CONFIG) {
  return {
    schemaVersion: 'lythaus-thermal-qualification-v1',
    generatedAt: new Date().toISOString(),
    hostPolicy: config.hardware,
    stages: qualificationPlan(config),
    records,
    status: qualificationStatus(records, config),
    unattendedTrainingEnabled: false,
    humanReviewRequired: true,
  };
}

if (process.argv.includes('--plan') || process.argv.includes('--dry-run')) {
  process.stdout.write(`${JSON.stringify({ mode: 'plan-only', plan: qualificationPlan(), unattendedTrainingEnabled: false }, null, 2)}\n`);
}
