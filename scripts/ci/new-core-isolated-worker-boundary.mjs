const own = (object, key) => !!object && Object.hasOwn(object,key);
const shape = (object, key) => {
  if (!own(object,key)) return 'omitted';
  const value = object[key];
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (Array.isArray(value)) return value.length ? 'nonempty_array' : 'empty_array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  return 'other';
};

export function workerBoundaryEvidence(worker, id, name) {
  const sub = worker?.subdomain, obs = worker?.observability;
  return {
    checks: {
      identity: worker?.name === name && worker?.id === id,
      workersDevDisabled: sub?.enabled === false,
      previewsDisabled: sub?.previews_enabled === false,
      logpushDisabled: worker?.logpush === false,
      observabilityDisabled: obs?.enabled === false,
      logsNotEnabled: obs?.logs?.enabled !== true,
      invocationLogsNotEnabled: obs?.logs?.invocation_logs !== true,
      tracesNotEnabled: obs?.traces?.enabled !== true,
      tailConsumersEmpty: Array.isArray(worker?.tail_consumers) && worker.tail_consumers.length === 0,
      customDomainsEmpty: Array.isArray(worker?.references?.domains) && worker.references.domains.length === 0,
    },
    fieldShapes: {
      workersDev:shape(sub,'enabled'), previews:shape(sub,'previews_enabled'),
      logpush:shape(worker,'logpush'), observability:shape(obs,'enabled'), logs:shape(obs?.logs,'enabled'),
      invocationLogs:shape(obs?.logs,'invocation_logs'), traces:shape(obs?.traces,'enabled'),
      agents:shape(obs?.agents,'enabled'), issues:shape(obs?.issues,'enabled'),
      tailConsumers:shape(worker,'tail_consumers'), customDomains:shape(worker?.references,'domains'),
      deployedOn:shape(worker,'deployed_on'),
    },
  };
}

export function scriptLoggingEvidence(row) {
  const {logpush,observability,logs,invocationLogs,traces,agents,issues,tailConsumers} = workerBoundaryEvidence(row).fieldShapes;
  const shapes = {logpush,observability,logs,invocationLogs,traces,agents,issues,tailConsumers};
  return {shapes,disabled:[logpush,observability,logs,invocationLogs,traces].every(value=>value==='false')
    && [agents,issues].every(value=>value==='omitted' || value==='false')
    && ['omitted','null','empty_array'].includes(tailConsumers)};
}
