import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 8080);
const maxBytes = 10 * 1024 * 1024;
const compilerVersion = 'lythaus-synthetic-evidence-compiler-v2';
const registryVersion = process.env.DETECTOR_REGISTRY_VERSION ?? '2026-09-16.wp007f.qualification-1';
const mode = process.env.LYTHAUS_AUTHENTICITY_ALPHA_MODE ?? 'SHADOW';

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) { req.destroy(); reject(new Error('image_payload_too_large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function missingEvidence(requestId, reason) {
  return {
    schemaVersion: 'lythaus-authenticity-alpha-service-v2',
    requestId,
    mode,
    analysisStatus: 'PARTIAL',
    syntheticEvidenceScore: null,
    syntheticEvidenceBand: 'LOW',
    syntheticEvidenceResolution: 'INSUFFICIENT',
    calibrationVersion: null,
    label: 'Under review',
    compilerVersion,
    detectorEvidence: [
      { detectorId: 'SPAI_C512', status: 'UNAVAILABLE', rawScore: null, calibratedStrength: null, warnings: [reason] },
      { detectorId: 'UNIVERSAL_FAKE_DETECT', status: 'UNAVAILABLE', rawScore: null, calibratedStrength: null, warnings: [reason] },
      { detectorId: 'RINE', status: 'UNAVAILABLE', rawScore: null, calibratedStrength: null, warnings: [reason] },
    ],
    groupEvidence: [],
    missingDetectors: ['SPAI_C512', 'UNIVERSAL_FAKE_DETECT', 'RINE'],
    warnings: [reason],
    observations: [],
    advisory: null,
    enforcementAuthority: 'NONE',
  };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { status: 'ok', mode, compilerVersion, registryVersion, modelArtifactsMounted: false, enforcementAuthority: 'NONE' });
    if (req.method === 'GET' && req.url === '/version') return json(res, 200, { serviceVersion: 'lythaus-authenticity-alpha-service-v2', compilerVersion, registryVersion, mode });
    if (req.method !== 'POST' || req.url !== '/score') return json(res, 404, { error: 'not_found' });
    const requestId = req.headers['x-request-id'];
    if (typeof requestId !== 'string' || !requestId) return json(res, 400, { error: 'request_id_required' });
    const body = await readBody(req);
    if (body.length === 0) return json(res, 400, { error: 'image_payload_required' });
    return json(res, 200, missingEvidence(requestId, 'Detector checkpoints are not mounted in the safe contract image; no synthetic claim was made.'));
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'alpha_service_failure', analysisStatus: 'PARTIAL', label: 'Under review', enforcementAuthority: 'NONE' });
  }
});

server.listen(port, '0.0.0.0');
