export const TEMPERATURE_STATES = Object.freeze(['VALID', 'UNAVAILABLE', 'STALE', 'IMPLAUSIBLE']);

function unavailable(reason) {
  return { state: 'UNAVAILABLE', celsius: null, observedAt: null, source: null, reason };
}

export function parseTemperatureReading(input, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = (options.maxAgeSeconds ?? 10) * 1000;
  const tjmaxC = options.tjmaxC ?? 95;
  if (!input || input.sourceVerified !== true || input.sensorKind !== 'cpu_package') return unavailable('cpu_package_sensor_not_verified');
  if (typeof input.celsius !== 'number' || !Number.isFinite(input.celsius) || input.celsius < 0 || input.celsius > tjmaxC + 10) {
    return { state: 'IMPLAUSIBLE', celsius: null, observedAt: input.observedAt ?? null, source: input.source ?? null, reason: 'temperature_outside_plausible_range' };
  }
  const observedMs = Date.parse(input.observedAt ?? '');
  if (!Number.isFinite(observedMs)) return unavailable('temperature_timestamp_invalid');
  if (observedMs > nowMs + 2000) return { state: 'IMPLAUSIBLE', celsius: null, observedAt: input.observedAt, source: input.source ?? null, reason: 'temperature_timestamp_in_future' };
  if (nowMs - observedMs > maxAgeMs) return { state: 'STALE', celsius: input.celsius, observedAt: input.observedAt, source: input.source ?? null, reason: 'temperature_reading_stale' };
  return { state: 'VALID', celsius: input.celsius, observedAt: input.observedAt, source: input.source ?? null, reason: 'verified_cpu_package_temperature' };
}

export function rejectAcpiThermalZoneReading(input) {
  if (input?.sensorKind === 'acpi_thermal_zone' || input?.source === 'MSAcpi_ThermalZoneTemperature') {
    return unavailable('acpi_thermal_zone_is_not_verified_cpu_package_temperature');
  }
  return parseTemperatureReading(input);
}

export class TemperatureProvider {
  async read() {
    return unavailable('no_verified_cpu_package_provider_configured');
  }
}

export class EnvironmentTemperatureProvider extends TemperatureProvider {
  async read() {
    const raw = process.env.LYTHAUS_CPU_PACKAGE_TEMPERATURE_JSON;
    if (!raw) return unavailable('no_verified_cpu_package_provider_configured');
    try {
      return parseTemperatureReading(JSON.parse(raw));
    } catch {
      return unavailable('temperature_provider_payload_invalid');
    }
  }
}
