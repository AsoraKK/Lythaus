import { RECORDED_WORKER_ID } from './new-core-isolated-cloudflare.mjs';

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

const absentOrFalse = value => ['omitted','false'].includes(value);
const absentOrObject = value => ['omitted','object'].includes(value);
const noDestinations = value => ['omitted','empty_array'].includes(value);

function loggingShapes(row) {
  const obs = row?.observability;
  return {logpush:shape(row,'logpush'), observabilityObject:shape(row,'observability'),
    observability:shape(obs,'enabled'), logsObject:shape(obs,'logs'), logs:shape(obs?.logs,'enabled'),
    invocationLogs:shape(obs?.logs,'invocation_logs'), tracesObject:shape(obs,'traces'), traces:shape(obs?.traces,'enabled'),
    agentsObject:shape(obs,'agents'), agents:shape(obs?.agents,'enabled'),
    issuesObject:shape(obs,'issues'), issues:shape(obs?.issues,'enabled'),
    logsDestinations:shape(obs?.logs,'destinations'), tracesDestinations:shape(obs?.traces,'destinations'),
    agentsDestinations:shape(obs?.agents,'destinations'), issuesDestinations:shape(obs?.issues,'destinations'),
    tailConsumers:shape(row,'tail_consumers')};
}

function secondaryLoggingNotEnabled(s, {allowNullRoot = false} = {}) {
  return (absentOrObject(s.observabilityObject) || (allowNullRoot && s.observabilityObject === 'null'))
    && [s.logsObject,s.tracesObject,s.agentsObject,s.issuesObject].every(absentOrObject)
    && [s.traces,s.agents,s.issues].every(absentOrFalse)
    && [s.logsDestinations,s.tracesDestinations,s.agentsDestinations,s.issuesDestinations].every(noDestinations);
}

export function workerBoundaryEvidence(worker, id, name) {
  const sub = worker?.subdomain, obs = worker?.observability;
  const logging = loggingShapes(worker);
  // Wrangler's regression test verifies a stored invocation_logs:true has no
  // effect with logs.enabled:false (cloudflare/workers-sdk#17044).
  const recordedParentsDisabled = id === RECORDED_WORKER_ID && worker?.id === id
    && worker?.name === name && logging.observability === 'false' && logging.logs === 'false';
  return {
    checks: {
      identity: worker?.name === name && worker?.id === id,
      workersDevDisabled: sub?.enabled === false,
      previewsDisabled: sub?.previews_enabled === false,
      logpushDisabled: worker?.logpush === false,
      observabilityDisabled: obs?.enabled === false,
      logsNotEnabled: id === RECORDED_WORKER_ID ? recordedParentsDisabled : absentOrFalse(logging.logs),
      invocationLogsNotEnabled: absentOrFalse(logging.invocationLogs) ||
        (recordedParentsDisabled && logging.invocationLogs === 'true'),
      tracesNotEnabled: absentOrFalse(logging.traces),
      secondaryLoggingNotEnabled:secondaryLoggingNotEnabled(logging),
      tailConsumersEmpty: Array.isArray(worker?.tail_consumers) && worker.tail_consumers.length === 0,
      customDomainsEmpty: Array.isArray(worker?.references?.domains) && worker.references.domains.length === 0,
    },
    fieldShapes: {
      workersDev:shape(sub,'enabled'), previews:shape(sub,'previews_enabled'),
      ...logging, customDomains:shape(worker?.references,'domains'),
      deployedOn:shape(worker,'deployed_on'),
    },
  };
}

export function scriptLoggingEvidence(row, worker) {
  const shapes = loggingShapes(row);
  return {shapes,disabled:!!row && typeof row === 'object' && !Array.isArray(row)
    && !!worker && Object.values(worker.checks).every(Boolean)
    && worker.fieldShapes.observability === 'false' && worker.fieldShapes.logs === 'false'
    && shapes.logpush === 'false' && [shapes.observability,shapes.logs,shapes.invocationLogs].every(absentOrFalse)
    // The independent script-settings response can have no override (null).
    // This is not proof of disabled logging without the explicit Worker readback above.
    && secondaryLoggingNotEnabled(shapes,{allowNullRoot:true})
    && ['omitted','null','empty_array'].includes(shapes.tailConsumers)};
}
