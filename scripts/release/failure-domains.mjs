export const FAILURE_DOMAINS = Object.freeze({
  SAFETY_BLOCKER: 'SAFETY_BLOCKER',
  PRODUCT_BLOCKER: 'PRODUCT_BLOCKER',
  CERTIFICATION_BLOCKER: 'CERTIFICATION_BLOCKER',
  OBSERVABILITY_WARNING: 'OBSERVABILITY_WARNING',
  TOOLING_FAILURE: 'TOOLING_FAILURE',
});

const normalized = (value) => String(value ?? '').toLowerCase();

export function classifyFailure({ gate = '', code = '', message = '' } = {}) {
  const normalizedGate = normalized(gate);
  const haystack = `${normalizedGate} ${normalized(code)} ${normalized(message)}`;
  if (/(runner|github|browser|playwright|computer-use|tooling|actionlint|npm ci|cancel+ed|pages(?: child| deployment| workflow)|network(?: timeout| error)|(?:provider|cloudflare|github).*rate limit|rate limit.*(?:provider|cloudflare|github))/.test(haystack)) {
    return FAILURE_DOMAINS.TOOLING_FAILURE;
  }
  const certificationSignal = /(observer|keeper|gmail|mailbox|human_acceptance_required|human.*turnstile|turnstile.*human|acceptance window|certification)/.test(haystack);
  if (certificationSignal && /(product_acceptance|acceptance)/.test(normalizedGate)) {
    return FAILURE_DOMAINS.CERTIFICATION_BLOCKER;
  }
  if (/(telemetry|observability|delivery observer unavailable|log export)/.test(haystack)) {
    return FAILURE_DOMAINS.OBSERVABILITY_WARNING;
  }
  if (certificationSignal) return FAILURE_DOMAINS.CERTIFICATION_BLOCKER;
  if (/(provider|infrastructure|hyperdrive|schema|migration|secret|credential|scope|provenance|identity|configuration).*(failed|invalid|missing|drift|mismatch|unavailable|rejected|not found)/.test(haystack)) {
    return FAILURE_DOMAINS.SAFETY_BLOCKER;
  }
  if (/(product acceptance|signup|verification|resend|password reset|login|session|replay|logout|turnstile|auth product)/.test(haystack)) {
    return FAILURE_DOMAINS.PRODUCT_BLOCKER;
  }
  return FAILURE_DOMAINS.SAFETY_BLOCKER;
}

export function failureDomainEvidence({ gate, code, message, domain = classifyFailure({ gate, code, message }) }) {
  const classifiedDomain = classifyFailure({ gate, code, message });
  if (domain !== classifiedDomain) throw new Error('failure domain does not match deterministic classification');
  return Object.freeze({
    gate: String(gate ?? 'UNKNOWN'),
    code: String(code ?? 'UNKNOWN'),
    domain: classifiedDomain,
    message: String(message ?? '').replace(/[^A-Za-z0-9 ._:/-]/g, '').slice(0, 240),
  });
}
