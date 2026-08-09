import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 8080);
const maxBytes = 10 * 1024 * 1024;
let firstRequest = true;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) { req.destroy(); reject(new Error('proof_payload_too_large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function featureVector(bytes) {
  if (bytes.length === 0) return [0, 0, 0, 0];
  let total = 0;
  let residualTotal = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    total += bytes[index] / 255;
    if (index > 0) residualTotal += Math.abs(bytes[index] - bytes[index - 1]) / 255;
  }
  const mean = total / bytes.length;
  let variance = 0;
  for (const value of bytes) variance += ((value / 255) - mean) ** 2;
  return [mean, variance / bytes.length, residualTotal / Math.max(1, bytes.length - 1), bytes.length / maxBytes];
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { status: 'ok', proofOnly: true });
    if (req.method !== 'POST' || req.url !== '/process') return json(res, 404, { error: 'not_found' });
    const startedAt = performance.now();
    const cpuBefore = process.cpuUsage();
    const coldStart = firstRequest;
    firstRequest = false;
    const body = await readBody(req);
    const caseId = req.headers['x-case-id'];
    if (typeof caseId !== 'string' || !caseId) return json(res, 400, { error: 'case_id_required' });
    const sha256 = createHash('sha256').update(body).digest('hex');
    const cpuAfter = process.cpuUsage(cpuBefore);
    return json(res, 200, {
      schemaVersion: 'lythaus-container-forensic-proof-v1',
      caseId,
      sha256,
      byteLength: body.length,
      mime: req.headers['content-type'] ?? 'application/octet-stream',
      featureVector: featureVector(body),
      coldStart,
      executionMs: performance.now() - startedAt,
      cpuTimeMs: (cpuAfter.user + cpuAfter.system) / 1000,
      residentMemoryMb: process.memoryUsage().rss / (1024 * 1024),
      estimatedCostUsd: null,
      enforcementAuthority: 'NONE',
    });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'proof_failed' });
  }
});

server.listen(port, '0.0.0.0');
