{{flutter_js}}
{{flutter_build_config}}

const webKit = navigator.vendor === 'Apple Computer, Inc.';

_flutter.loader.load({
  config: { canvasKitForceCpuOnly: webKit },
  serviceWorkerSettings: {
    serviceWorkerVersion: {{flutter_service_worker_version}}
  }
});
