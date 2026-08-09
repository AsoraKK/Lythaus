import { ECO_TRAIN_CONFIG } from './config.mjs';
import { EnvironmentTemperatureProvider } from './temperature-provider.mjs';

export function validateEcoTrainAdmission(input) {
  const config = input.config ?? ECO_TRAIN_CONFIG;
  const reasons = [];
  const system = input.system ?? {};
  const temperature = input.temperature ?? { state: 'UNAVAILABLE', celsius: null };
  if (input.unattended === true && !config.unattended.enabled_by_default) reasons.push('UNATTENDED_TRAINING_DISABLED_BY_DEFAULT');
  if (config.power.require_ac && system.onAcPower !== true) reasons.push('AC_POWER_REQUIRED');
  const maximumAllowedThreads = input.qualified === true ? config.cpu.maximum_worker_threads_after_qualification : config.cpu.initial_worker_threads;
  if (system.cpuThreads !== undefined && system.cpuThreads > maximumAllowedThreads) reasons.push('WORKER_THREAD_LIMIT_EXCEEDED');
  if (config.cpu.target_utilisation_percent > config.cpu.absolute_ceiling_percent || config.cpu.absolute_ceiling_percent > 50) reasons.push('CPU_POLICY_INVALID');
  if (system.cpuUtilisationPercent !== undefined && system.cpuUtilisationPercent > config.cpu.absolute_ceiling_percent) reasons.push('CPU_CEILING_EXCEEDED');
  if (system.processMemoryGb !== undefined && system.processMemoryGb > config.memory.max_process_gb) reasons.push('PROCESS_MEMORY_LIMIT_EXCEEDED');
  if (system.freeSystemGb !== undefined && system.freeSystemGb < config.memory.minimum_free_system_gb) reasons.push('FREE_SYSTEM_MEMORY_TOO_LOW');
  if (system.freeDiskGb !== undefined && system.freeDiskGb < config.storage.minimum_free_disk_gb) reasons.push('FREE_DISK_TOO_LOW');
  if (system.processPriority !== undefined && system.processPriority !== config.cpu.process_priority) reasons.push('PROCESS_PRIORITY_INVALID');
  if (temperature.state !== 'VALID') reasons.push('VALID_CPU_PACKAGE_TEMPERATURE_REQUIRED');
  if (temperature.state === 'VALID' && temperature.celsius >= config.thermal.pause_c) reasons.push('THERMAL_PAUSE_THRESHOLD_REACHED');
  return { allowed: reasons.length === 0, reasons, failClosed: temperature.state !== 'VALID' };
}

export function telemetryAction(temperature, config = ECO_TRAIN_CONFIG) {
  if (temperature.state !== 'VALID') return { action: 'PROHIBITED', reason: 'VALID_CPU_PACKAGE_TEMPERATURE_REQUIRED' };
  if (temperature.celsius >= config.thermal.emergency_stop_c) return { action: 'EMERGENCY_STOP', reason: 'THERMAL_EMERGENCY_STOP_THRESHOLD_REACHED' };
  if (temperature.celsius >= config.thermal.pause_c) return { action: 'PAUSE', reason: 'THERMAL_PAUSE_THRESHOLD_REACHED' };
  return { action: 'CONTINUE', reason: 'THERMAL_TELEMETRY_VALID' };
}

export class EcoTrainController {
  constructor(options = {}) {
    this.config = options.config ?? ECO_TRAIN_CONFIG;
    this.temperatureProvider = options.temperatureProvider ?? new EnvironmentTemperatureProvider();
  }

  async check(input = {}) {
    const temperature = input.temperature ?? await this.temperatureProvider.read();
    const admission = validateEcoTrainAdmission({ ...input, config: this.config, temperature });
    return { ...admission, temperature, action: telemetryAction(temperature, this.config) };
  }

  shouldCheckpoint() {
    return this.config.training.frequent_checkpoints && this.config.training.resumable;
  }

  canResume(temperature, stableSeconds) {
    return temperature.state === 'VALID' && temperature.celsius < this.config.thermal.resume_below_c && stableSeconds >= this.config.thermal.resume_stable_seconds;
  }
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
  const controller = new EcoTrainController();
  const result = await controller.check({ unattended: process.argv.includes('--unattended') });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.allowed) process.exitCode = 2;
}
