export const ECO_TRAIN_CONFIG = Object.freeze({
  hardware: {
    cpu_model: 'AMD Ryzen 7 7730U',
    cpu_threads: 16,
    system_ram_gb: 16,
  },
  power: {
    require_ac: true,
    prohibit_battery_training: true,
  },
  cpu: {
    target_utilisation_percent: 40,
    absolute_ceiling_percent: 50,
    initial_worker_threads: 4,
    maximum_worker_threads_after_qualification: 6,
    process_priority: 'below_normal',
  },
  memory: {
    max_process_gb: 6,
    minimum_free_system_gb: 4,
  },
  storage: {
    minimum_free_disk_gb: 80,
  },
  thermal: {
    tjmax_c: 95,
    pause_c: 75,
    emergency_stop_c: 85,
    resume_below_c: 65,
    resume_stable_seconds: 120,
    fail_closed_without_valid_sensor: true,
  },
  training: {
    frequent_checkpoints: true,
    resumable: true,
    pause_between_epochs: true,
  },
  unattended: {
    enabled_by_default: false,
  },
});
