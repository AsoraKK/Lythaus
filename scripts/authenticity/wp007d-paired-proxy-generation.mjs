import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { inflateRawSync } from 'node:zlib';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

import {
  WP007D_BENCHMARK_FINGERPRINT,
  WP007D_CANONICAL_RESAMPLER,
  WP007D_CANONICAL_SIZE,
  WP007D_CAMERA_SAMPLE_IDS,
  WP007D_COST_CAP_USD,
  WP007D_EXPECTED_REQUEST_COUNT,
  WP007D_EXPECTED_SOURCE_FAMILY_COUNT,
  WP007D_BLOCKED_PRIMARY_ROUTE,
  WP007D_FLUX2_RESERVE_FREEZE_SHA,
  WP007D_HISTORICAL_GENERATION_FREEZE_SHA,
  WP007D_PROGRAMMATIC_SELECTION,
  WP007D_PROXY_GENERATORS,
  WP007D_PROXY_PLAN_SCHEMA_VERSION,
  WP007D_PROXY_PROMPT,
  WP007D_STRENGTHS,
  WP007D_WP007AHR4_HOLDOUT_FREEZE_SHA,
  WP007D_WP007C_MERGE_SHA,
  assertWp007dGeneratedRecord,
  assertWp007dPlan,
  deriveProxySeed,
  proxyRequestBody,
  sha256Bytes,
  stableWp007dHash,
} from '../../packages/authenticity/src/wp007d.ts';
import { materializeProgrammaticNegatives } from './wp007a-build-hard-negatives.mjs';

const execFile = promisify(execFileCallback);
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FOUNDATION_PATH = path.join(REPOSITORY_ROOT, 'research', 'wp007a', 'ef3-negative-foundation.json');
const RIGHTS_PATH = path.join(REPOSITORY_ROOT, 'research', 'wp007d', 'rights-audit.json');
const CSAFE_PATH_MANIFEST = path.join(REPOSITORY_ROOT, 'research', 'wp006e', 'csafe-replication-manifest.json');
const CLOUDFLARE_API_ROOT = 'https://api.cloudflare.com/client/v4/accounts';
const CSAFE_ROOT = 'https://data.csafe.iastate.edu/Multi-Camid/';
const MAX_RETRIES = 1;

function parseArgs(argv) {
  const options = {
    mode: 'preflight',
    smokeOnly: false,
    outputCache: process.env.OUTPUT_CACHE ?? path.join(os.tmpdir(), `wp007d-paired-proxy-${process.pid}`),
    maxPaidCostUsd: WP007D_COST_CAP_USD,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--mode') options.mode = argv[++index];
    else if (argument === '--smoke-only') options.smokeOnly = true;
    else if (argument === '--output-cache') options.outputCache = path.resolve(argv[++index]);
    else if (argument === '--max-paid-cost') options.maxPaidCostUsd = Number(argv[++index]);
    else throw new Error(`wp007d_unknown_argument:${argument}`);
  }
  return options;
}

function assertExternalCache(cacheDir) {
  if (!path.isAbsolute(cacheDir)) throw new Error('wp007d_cache_must_be_absolute');
  const relative = path.relative(REPOSITORY_ROOT, path.resolve(cacheDir));
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) throw new Error('wp007d_cache_inside_repository');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function currentGitSha() {
  if (process.env.GITHUB_SHA && /^[a-f0-9]{40}$/u.test(process.env.GITHUB_SHA)) return process.env.GITHUB_SHA;
  const result = await execFile('git', ['rev-parse', 'HEAD'], { cwd: REPOSITORY_ROOT });
  return result.stdout.trim();
}

function safeErrorMessage(value) {
  if (typeof value !== 'string') return null;
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, 'Bearer [REDACTED]')
    .replace(/(?:api[_-]?key|token|secret|authorization)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]')
    .replace(/https?:\/\/[^\s)]+/giu, '[URL]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 240) || null;
}

function classifyProviderFailure(httpStatus, message) {
  const text = String(message ?? '');
  if (httpStatus === 401 || httpStatus === 403 || /unauthori[sz]ed|forbidden|permission|authentication/iu.test(text)) return 'AUTH_FAILURE';
  if (httpStatus === 404 || /model\s+(?:not|does not)\s+found|unknown\s+model/iu.test(text)) return 'MODEL_NOT_FOUND';
  if (httpStatus === 429 && /daily|quota|exhausted/iu.test(text)) return 'DAILY_QUOTA';
  if (httpStatus === 429 || /rate\s*limit|too many requests/iu.test(text)) return 'RATE_LIMIT';
  if (httpStatus !== null && httpStatus >= 500) return 'PROVIDER_INTERNAL_ERROR';
  if (httpStatus === 400) {
    if (/unknown\s+(?:field|property)|unrecognized\s+(?:field|property)|unsupported|additional\s+propert|unexpected\s+(?:field|property)|not\s+(?:allowed|permitted)|does\s+not\s+accept/iu.test(text)) return 'REQUEST_PARAMETER_UNSUPPORTED';
    if (/range|minimum|maximum|between|at\s+least|at\s+most|greater\s+than|less\s+than|out\s+of\s+bounds/iu.test(text)) return 'REQUEST_PARAMETER_RANGE_INVALID';
    if (/schema|validation|invalid|malformed|required|missing|request\s+body|json/iu.test(text)) return 'REQUEST_SCHEMA_INVALID';
    return 'UNKNOWN_PROVIDER_400';
  }
  return httpStatus === null ? 'TRANSPORT_ERROR' : 'UNKNOWN_PROVIDER_ERROR';
}

function providerErrorFields(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const first = errors.find((item) => item && typeof item === 'object' && (typeof item.message === 'string' || typeof item.code === 'string' || typeof item.code === 'number')) ?? null;
  return {
    providerErrorCode: Number.isSafeInteger(first?.code) || typeof first?.code === 'string' ? first.code : null,
    providerErrorMessage: safeErrorMessage(first?.message),
  };
}

function failureObject({ modelId, httpStatus = null, errorCode = null, message = null, retryable = false }) {
  const providerErrorMessage = safeErrorMessage(message);
  return {
    modelId,
    providerHttpStatus: httpStatus,
    providerErrorCode: errorCode,
    providerErrorMessage,
    failureCategory: classifyProviderFailure(httpStatus, providerErrorMessage),
    retryable,
  };
}

function modelRunUrl(accountId, modelId) {
  const encodedModelPath = modelId.split('/').map((segment) => encodeURIComponent(segment).replace(/^%40cf$/iu, '@cf')).join('/');
  return `${CLOUDFLARE_API_ROOT}/${encodeURIComponent(accountId)}/ai/run/${encodedModelPath}`;
}

async function requestCloudflare(modelId, body) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) throw Object.assign(new Error('wp007d_cloudflare_credentials_missing'), failureObject({ modelId, message: 'credentials missing' }));
  let response;
  try {
    response = await fetch(modelRunUrl(accountId, modelId), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw Object.assign(new Error('wp007d_cloudflare_transport_error'), failureObject({ modelId, message: error?.message, retryable: true }));
  }
  if (!response.ok) {
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    const details = providerErrorFields(payload);
    throw Object.assign(new Error(`wp007d_cloudflare_http_${response.status}`), failureObject({ modelId, httpStatus: response.status, errorCode: details.providerErrorCode, message: details.providerErrorMessage, retryable: response.status >= 500 || response.status === 429 }));
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    let payload;
    try { payload = await response.json(); } catch { throw Object.assign(new Error('wp007d_provider_json_invalid'), failureObject({ modelId, httpStatus: response.status, message: 'provider JSON response invalid' })); }
    const image = typeof payload?.result?.image === 'string' ? payload.result.image : typeof payload?.image === 'string' ? payload.image : null;
    if (!image) throw Object.assign(new Error('wp007d_provider_image_missing'), failureObject({ modelId, httpStatus: response.status, message: 'provider image field missing' }));
    return { bytes: Buffer.from(image.replace(/^data:[^;]+;base64,/iu, ''), 'base64'), responseContentType: contentType };
  }
  return { bytes: Buffer.from(await response.arrayBuffer()), responseContentType: contentType };
}

function schemaField(input, field) {
  const property = input && typeof input === 'object' && input.properties && typeof input.properties === 'object' ? input.properties[field] : null;
  const types = Array.isArray(property?.type) ? property.type : typeof property?.type === 'string' ? [property.type] : [];
  return {
    present: Boolean(property),
    type: types.length === 1 ? types[0].toUpperCase() : types.length > 1 ? types.join('|').toUpperCase() : null,
    required: Array.isArray(input?.required) && input.required.includes(field),
    minimum: typeof property?.minimum === 'number' ? property.minimum : null,
    maximum: typeof property?.maximum === 'number' ? property.maximum : null,
  };
}

function safeSchemaSummary(input, output) {
  return {
    inputType: input?.type ?? null,
    outputType: output?.type ?? null,
    prompt: schemaField(input, 'prompt'),
    num_steps: schemaField(input, 'num_steps'),
    seed: schemaField(input, 'seed'),
    width: schemaField(input, 'width'),
    height: schemaField(input, 'height'),
    strength: schemaField(input, 'strength'),
    guidance: schemaField(input, 'guidance'),
    image_b64: schemaField(input, 'image_b64'),
  };
}

async function cloudflareJson(url, token) {
  let response;
  try {
    response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  } catch (error) {
    return { ok: false, status: null, payload: null, error: safeErrorMessage(error?.message) };
  }
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  return { ok: response.ok, status: response.status, payload, error: null };
}

function catalogEntries(payload) {
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.result?.models)) return payload.result.models;
  if (Array.isArray(payload?.models)) return payload.models;
  return [];
}

function callableName(entry) {
  for (const key of ['name', 'model_id', 'modelId']) if (typeof entry?.[key] === 'string') return entry[key];
  return null;
}

async function runRoutePreflight() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) return { status: 'AUTH_BLOCKED', authStatus: 'REQUIRED_SECRET_MISSING', models: [] };
  const models = [];
  for (const generator of WP007D_PROXY_GENERATORS) {
    const schemaResult = await cloudflareJson(`${CLOUDFLARE_API_ROOT}/${encodeURIComponent(accountId)}/ai/models/schema?model=${encodeURIComponent(generator.modelId)}`, token);
    const input = schemaResult.payload?.result?.input;
    const output = schemaResult.payload?.result?.output;
    const schema = schemaResult.ok && schemaResult.payload?.success === true && input && output ? safeSchemaSummary(input, output) : null;
    const searchTerm = generator.modelId.split('/').at(-1);
    const catalogResult = await cloudflareJson(`${CLOUDFLARE_API_ROOT}/${encodeURIComponent(accountId)}/ai/models/search?search=${encodeURIComponent(searchTerm)}&hide_experimental=false&include_deprecated=false&per_page=20`, token);
    const catalogMatch = catalogEntries(catalogResult.payload).find((entry) => callableName(entry) === generator.modelId);
    const requiredFieldsPass = Boolean(schema?.prompt.present && schema?.num_steps.present && schema?.seed.present && schema?.width.present && schema?.height.present && schema?.strength.present && schema?.image_b64.present);
    models.push({
      generatorId: generator.generatorId,
      modelId: generator.modelId,
      schemaStatus: schemaResult.status === 401 || schemaResult.status === 403 ? 'AUTH_BLOCKED' : schemaResult.ok && schema ? requiredFieldsPass ? 'SCHEMA_AVAILABLE' : 'SCHEMA_MISSING_REQUIRED_FIELDS' : schemaResult.status === 404 ? 'ROUTE_UNAVAILABLE' : 'SCHEMA_API_ERROR',
      schemaHttpStatus: schemaResult.status,
      schema,
      catalogStatus: catalogMatch ? 'CATALOG_MATCH' : catalogResult.ok ? 'CATALOG_MISMATCH' : 'CATALOG_UNAVAILABLE',
      routeStatus: requiredFieldsPass && Boolean(catalogMatch) ? 'PASS' : 'BLOCKED',
      providerErrorCode: schemaResult.ok ? null : providerErrorFields(schemaResult.payload).providerErrorCode,
      providerErrorMessage: schemaResult.ok ? null : providerErrorFields(schemaResult.payload).providerErrorMessage,
    });
  }
  const routePass = models.length === WP007D_PROXY_GENERATORS.length && models.every((model) => model.routeStatus === 'PASS');
  return { status: routePass ? 'PASS' : 'BLOCKED', authStatus: models.some((model) => model.schemaStatus === 'AUTH_BLOCKED') ? 'AUTH_FAILURE' : 'PASS', models };
}

async function assertImmutableBaseline() {
  const holdout = await readJson(path.join(REPOSITORY_ROOT, 'research', 'wp007ahr4', 'holdout-freeze.json'));
  const reserve = await readJson(path.join(REPOSITORY_ROOT, 'research', 'wp007ahr4', 'flux2-future-reserve-freeze.json'));
  if (holdout.freezeSha256 !== WP007D_WP007AHR4_HOLDOUT_FREEZE_SHA || holdout.benchmarkFingerprint !== WP007D_BENCHMARK_FINGERPRINT || holdout.flux2?.status !== 'SEALED_FUTURE_RESERVE') throw new Error('wp007d_holdout_baseline_mismatch');
  if (reserve.freezeSha256 !== WP007D_FLUX2_RESERVE_FREEZE_SHA || reserve.benchmarkFingerprint !== WP007D_BENCHMARK_FINGERPRINT) throw new Error('wp007d_flux2_reserve_baseline_mismatch');
  const flux1Records = Array.isArray(holdout.flux1?.records) ? holdout.flux1.records : [];
  if (holdout.roles?.flux1 !== 'SEALED_FOR_WP007B' || holdout.flux1?.pixelAccessBeforeFreeze !== false || flux1Records.length !== 40 || flux1Records.some((record) => record?.benchmarkRole !== 'SEALED_GENERATOR_HOLDOUT')) throw new Error('wp007d_flux1_status_mismatch');
  const historical = await readJson(path.join(REPOSITORY_ROOT, 'research', 'wp007ah', 'generation-freeze.json'));
  if (historical.freezeSha256 !== WP007D_HISTORICAL_GENERATION_FREEZE_SHA) throw new Error('wp007d_historical_freeze_mismatch');
  return { holdoutFreezeSha256: holdout.freezeSha256, flux2ReserveFreezeSha256: reserve.freezeSha256, historicalFreezeSha256: historical.freezeSha256 };
}

function decodeHtmlAttribute(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
}

function parseTagAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([A-Za-z][A-Za-z0-9:-]*)\s*=\s*(?:(['"])(.*?)\2|([^\s>]+))/gs)) attributes[match[1]] = decodeHtmlAttribute(match[3] ?? match[4]);
  return attributes;
}

let csafeCookie = '';
async function portalFetch(url, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (csafeCookie) headers.set('cookie', csafeCookie);
  const response = await fetch(url, { ...init, headers });
  const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (setCookies.length > 0) csafeCookie = setCookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
  return response;
}

function csafeQueryForRecord(record) {
  const device = record.cameraDeviceFamily;
  const isApple = device.startsWith('iPhone');
  const model = isApple ? device.match(/^iPhone\d+/u)?.[0] : 'note10';
  if (!model) throw new Error(`wp007d_csafe_model_unresolved:${record.sampleId}`);
  return {
    phone_brand: [isApple ? 'Apple_phones' : 'Samsung_phones'],
    phone_model: [model],
    phone_device: [device],
    camera_type: [record.lens],
    scene_type: [record.sceneType],
  };
}

async function queryCsafePaths(record) {
  const query = JSON.stringify(csafeQueryForRecord(record));
  const body = new URLSearchParams({ multiCamIdDataJsonObjStr: query, globaLoggingString: '' });
  const response = await portalFetch(`${CSAFE_ROOT}CollectMultiCamIdStudyThumbnailImagesData.do`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error(`wp007d_csafe_query_http_${response.status}`);
  const html = await response.text();
  const candidates = [];
  for (const tagMatch of html.matchAll(/<input\b[^>]*>/gi)) {
    const attrs = parseTagAttributes(tagMatch[0]);
    if (attrs.type?.toLowerCase() !== 'hidden' || !attrs.value || attrs.thumbnailCount === undefined) continue;
    candidates.push({ path: attrs.value, imageNumber: attrs.thumbnailCount });
  }
  const unique = new Map(candidates.map((candidate) => [`${candidate.imageNumber}:${candidate.path}`, candidate]));
  if (unique.size === 0) throw new Error(`wp007d_csafe_query_empty:${record.sampleId}`);
  return [...unique.values()];
}

function normalizePortalPath(value) {
  return String(value ?? '').replace(/^\\+/u, '').replace(/\\+/gu, '/').toLowerCase();
}

function zipEntry(bytes) {
  const localSignature = 0x04034b50;
  const centralSignature = 0x02014b50;
  let centralOffset = -1;
  for (let offset = 0; offset + 4 <= bytes.length; offset += 1) {
    if (bytes.readUInt32LE(offset) === centralSignature) { centralOffset = offset; break; }
  }
  let localOffset = 0;
  let compressedSize = 0;
  let method = 0;
  if (centralOffset >= 0) {
    method = bytes.readUInt16LE(centralOffset + 10);
    compressedSize = bytes.readUInt32LE(centralOffset + 20);
    localOffset = bytes.readUInt32LE(centralOffset + 42);
  }
  if (bytes.readUInt32LE(localOffset) !== localSignature) throw new Error('wp007d_csafe_zip_invalid');
  if (centralOffset < 0) {
    method = bytes.readUInt16LE(localOffset + 8);
    compressedSize = bytes.readUInt32LE(localOffset + 18);
  }
  const nameLength = bytes.readUInt16LE(localOffset + 26);
  const extraLength = bytes.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const compressed = bytes.subarray(start, start + compressedSize);
  if (method === 0) return Buffer.from(compressed);
  if (method === 8) return inflateRawSync(compressed);
  throw new Error(`wp007d_csafe_zip_method_unsupported:${method}`);
}

async function downloadCsafeCandidate(candidate) {
  const body = new URLSearchParams({ filePaths: candidate.path, imageNumbers: candidate.imageNumber, globaLoggingString: '' });
  const response = await portalFetch(`${CSAFE_ROOT}DownloadMultiCamIdStudyOriginalImagesData.do`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error(`wp007d_csafe_download_http_${response.status}`);
  return zipEntry(Buffer.from(await response.arrayBuffer()));
}

async function materializeCsafeRecord(record, sourceDir, pathRecord) {
  const destination = path.join(sourceDir, `${record.sampleId}.jpg`);
  try {
    const cached = new Uint8Array(await readFile(destination));
    if (sha256Bytes(cached) === record.file.sha256) return cached;
  } catch {
    // Cache miss is expected on a new runner.
  }
  const candidates = await queryCsafePaths(record);
  const expectedMember = normalizePortalPath(pathRecord?.member);
  const exactCandidates = expectedMember
    ? candidates.filter((candidate) => normalizePortalPath(candidate.path).endsWith(expectedMember))
    : [];
  if (exactCandidates.length === 0) throw new Error(`wp007d_csafe_expected_member_not_indexed:${record.sampleId}`);
  for (const candidate of exactCandidates) {
    const bytes = await downloadCsafeCandidate(candidate);
    if (sha256Bytes(bytes) !== record.file.sha256) continue;
    await writeFile(destination, bytes);
    return bytes;
  }
  throw new Error(`wp007d_csafe_source_hash_not_found:${record.sampleId}`);
}

async function canonicalize(bytes) {
  return sharp(bytes, { failOn: 'error' })
    .rotate()
    .toColourspace('srgb')
    .resize(WP007D_CANONICAL_SIZE.width, WP007D_CANONICAL_SIZE.height, { fit: 'cover', position: 'center', kernel: sharp.kernel.lanczos3 })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

function selectedFoundationRecords(foundation) {
  const camera = WP007D_CAMERA_SAMPLE_IDS.map((sampleId) => foundation.records.find((record) => record.sampleId === sampleId));
  const digital = WP007D_PROGRAMMATIC_SELECTION.map((sampleId) => foundation.records.find((record) => record.sampleId === sampleId));
  if (camera.some((record) => !record) || digital.some((record) => !record)) throw new Error('wp007d_foundation_selection_missing');
  return [...camera, ...digital];
}

async function materializeSources({ cacheDir, foundation }) {
  const sourceDir = path.join(cacheDir, 'sources', 'original');
  const canonicalDir = path.join(cacheDir, 'sources', 'canonical');
  const programmaticDir = path.join(cacheDir, 'sources', 'programmatic');
  const csafePathManifest = await readJson(CSAFE_PATH_MANIFEST);
  const csafePaths = new Map((Array.isArray(csafePathManifest.records) ? csafePathManifest.records : []).map((record) => [record.sampleId, record]));
  await mkdir(sourceDir, { recursive: true });
  await mkdir(canonicalDir, { recursive: true });
  const programmatic = await materializeProgrammaticNegatives({ cacheDir: programmaticDir });
  const records = [];
  for (const source of selectedFoundationRecords(foundation)) {
    const isCamera = source.sampleId.startsWith('CSAFE_');
    const original = isCamera
      ? await materializeCsafeRecord(source, sourceDir, csafePaths.get(source.sampleId))
      : new Uint8Array(await readFile(path.join(programmaticDir, `${source.sampleId}.svg`)));
    if (sha256Bytes(original) !== source.file.sha256) throw new Error(`wp007d_source_hash_mismatch:${source.sampleId}`);
    const canonical = await canonicalize(original);
    const canonicalSha256 = sha256Bytes(canonical);
    const canonicalFile = path.join(canonicalDir, `${source.sampleId}.png`);
    await writeFile(canonicalFile, canonical);
    const output = {
      sampleId: source.sampleId,
      sourceFamilyId: source.sourceFamilyId,
      sourceType: isCamera ? 'CAMERA_NEGATIVE' : 'DIGITAL_NON_AI',
      sourceRole: 'PAIR_BASE_TRAINING_ELIGIBLE',
      cameraDeviceFamily: source.cameraDeviceFamily ?? null,
      hardNegativeSubtype: source.benchmark?.hardNegativeSubtype ?? null,
      rights: source.rights,
      file: { ...source.file, sha256: source.file.sha256, cacheId: `sources/original/${source.sampleId}.${isCamera ? 'jpg' : 'svg'}` },
      canonicalSha256,
      canonicalFile: `sources/canonical/${source.sampleId}.png`,
      canonicalDimensions: { ...WP007D_CANONICAL_SIZE },
      canonicalFormat: 'PNG',
      canonicalTransform: 'decode; declared orientation; RGB/sRGB; preserve aspect ratio; resize shorter edge to 512; centered 512x512 crop; no content-aware crop',
      canonicalResampler: WP007D_CANONICAL_RESAMPLER,
      sourceProviderPathResolution: isCamera ? 'OFFICIAL_CSAFE_QUERY_MATCHED_BY_SHA256' : 'REGENERATED_FROM_COMMITTED_DETERMINISTIC_RENDERER',
    };
    records.push(output);
  }
  if (records.length !== WP007D_EXPECTED_SOURCE_FAMILY_COUNT) throw new Error('wp007d_source_materialization_count_invalid');
  return { records, programmaticManifestHash: sha256Bytes(new Uint8Array(await readFile(path.join(programmaticDir, 'manifest.json')))) };
}

async function buildPlan({ cacheDir, baseSha }) {
  const foundation = await readJson(FOUNDATION_PATH);
  const rights = await readJson(RIGHTS_PATH);
  const sources = await materializeSources({ cacheDir, foundation });
  const rightsAuditSha256 = sha256Bytes(new Uint8Array(await readFile(RIGHTS_PATH)));
  const csafePathManifestSha256 = sha256Bytes(new Uint8Array(await readFile(CSAFE_PATH_MANIFEST)));
  const plan = {
    schemaVersion: WP007D_PROXY_PLAN_SCHEMA_VERSION,
    planId: 'WP007D_PAIRED_PROXY_PLAN_V1',
    baseSha,
    wp007cMergeSha: WP007D_WP007C_MERGE_SHA,
    benchmarkFingerprint: WP007D_BENCHMARK_FINGERPRINT,
    historicalGenerationFreezeSha256: WP007D_HISTORICAL_GENERATION_FREEZE_SHA,
    priorCombinedHoldoutFreezeSha256: WP007D_WP007AHR4_HOLDOUT_FREEZE_SHA,
    flux2ReserveFreezeSha256: WP007D_FLUX2_RESERVE_FREEZE_SHA,
    rightsAuditSha256,
    csafePathManifest: 'research/wp006e/csafe-replication-manifest.json',
    csafePathManifestSha256,
    sourceFoundation: 'research/wp007a/ef3-negative-foundation.json',
    sourceEligibility: 'rights-clean development only; no owner private media; no sealed or FLUX pixels',
    prompt: WP007D_PROXY_PROMPT,
    canonicalization: {
      outputDimensions: { ...WP007D_CANONICAL_SIZE },
      resampler: WP007D_CANONICAL_RESAMPLER,
      orientation: 'DECLARED_ORIENTATION_APPLIED',
      colorspace: 'RGB_SRGB',
      crop: 'DETERMINISTIC_CENTER_CROP',
      contentAware: false,
      sameCanonicalPixelsSuppliedToImg2Img: true,
    },
    generators: WP007D_PROXY_GENERATORS.map((generator) => ({ ...generator, fixedParameters: { ...generator.fixedParameters }, seedPolicy: 'SHA256_WP007D_SOURCE_FAMILY_MODEL_STRENGTH_TO_PROVIDER_DOCUMENTED_UINT32' })),
    generatorSelection: {
      primaryRouteSet: ['G1_SD15_IMG2IMG', 'G2_SDXL_BASE_IMG2IMG', 'G3_SDXL_LIGHTNING_IMG2IMG'],
      fallbackActivated: true,
      fallbackGeneratorId: 'G4_DREAMSHAPER_8_LCM_IMG2IMG',
      activationEvidence: { ...WP007D_BLOCKED_PRIMARY_ROUTE },
    },
    strengths: [...WP007D_STRENGTHS],
    sources: sources.records,
    programmaticSourceManifestSha256: sources.programmaticManifestHash,
    requested: WP007D_EXPECTED_REQUEST_COUNT,
    expectedProviderCalls: WP007D_EXPECTED_REQUEST_COUNT,
    costCapUsd: WP007D_COST_CAP_USD,
    projectedPaidCostUsd: 0,
    currentRouteUnitPriceEvidence: 'Current official Cloudflare model pages report $0.00 per step for the three selected routes; live preflight rechecks route availability and schema.',
    retryPolicy: { maxIdenticalTransportRetries: MAX_RETRIES, retryOnlyForRetryableTransportOrProviderFailure: true, neverRetryForContentQuality: true, neverReplaceSourceFamily: true },
    roles: { generatedProxy: 'PAIRED_GENERATIVE_PROXY', canonicalReal: 'PAIR_BASE_REAL_MEMBER', benchmarkTruth: 'PROXY_ONLY_NOT_PRIMARY_BENCHMARK_TRUTH' },
    holdoutPixelAccess: false,
    flux1PixelAccess: false,
    flux2PixelAccess: false,
    detectorInference: false,
    trainingOfBackbone: false,
    transformations: false,
    generationStartedAfterPlanFreeze: true,
  };
  assertWp007dPlan(plan);
  const planSha256 = stableWp007dHash(plan);
  await writeJson(path.join(cacheDir, 'paired-proxy-plan.json'), plan);
  await writeFile(path.join(cacheDir, 'paired-proxy-plan.sha256'), `${planSha256}\n`, 'utf8');
  return { plan, planSha256, sourceCount: sources.records.length, rightsAuditSha256, programmaticManifestHash: sources.programmaticManifestHash };
}

async function preflight(options) {
  assertExternalCache(options.outputCache);
  await mkdir(options.outputCache, { recursive: true });
  const baseline = await assertImmutableBaseline();
  const baseSha = await currentGitSha();
  const rights = await readJson(RIGHTS_PATH);
  if (rights.proxyGenerators?.length !== 3 || rights.proxyGenerators.some((generator) => generator.classification !== 'TRAINING_PROXY_ELIGIBLE')) throw new Error('wp007d_proxy_rights_not_predeclared_eligible');
  const planResult = await buildPlan({ cacheDir: options.outputCache, baseSha });
  const routes = await runRoutePreflight();
  const summary = {
    schemaVersion: 'lythaus-wp007d-preflight-v1',
    status: routes.status === 'PASS' && planResult.sourceCount === WP007D_EXPECTED_SOURCE_FAMILY_COUNT && options.maxPaidCostUsd >= 0 && options.maxPaidCostUsd <= WP007D_COST_CAP_USD ? 'PASS' : 'BLOCKED',
    passed: routes.status === 'PASS' && planResult.sourceCount === WP007D_EXPECTED_SOURCE_FAMILY_COUNT && options.maxPaidCostUsd >= 0 && options.maxPaidCostUsd <= WP007D_COST_CAP_USD,
    authStatus: routes.authStatus,
    rightsStatus: 'PASS',
    routeStatus: routes.status,
    models: routes.models,
    planHashVerified: true,
    planSha256: planResult.planSha256,
    sourceFamilyCount: planResult.sourceCount,
    requested: WP007D_EXPECTED_REQUEST_COUNT,
    projectedPaidCostUsd: 0,
    costCapUsd: options.maxPaidCostUsd,
    costStatus: 'BOUNDED_COST_AUTHORIZED',
    generationCalls: 0,
    flux1ProviderCalls: 0,
    flux2ProviderCalls: 0,
    flux1PixelAccess: false,
    flux2PixelAccess: false,
    detectorInference: false,
    training: false,
    transformations: false,
    baseSha,
    baseline,
    credentialsPrinted: false,
  };
  await writeJson(path.join(options.outputCache, 'preflight.json'), summary);
  return summary;
}

async function loadManifest(manifestPath, plan) {
  try {
    const manifest = await readJson(manifestPath);
    if (manifest.planSha256 !== stableWp007dHash(plan)) throw new Error('wp007d_resume_plan_hash_mismatch');
    return manifest;
  } catch (error) {
    if (error?.message === 'wp007d_resume_plan_hash_mismatch') throw error;
    return { schemaVersion: 'lythaus-wp007d-generation-manifest-v1', planSha256: stableWp007dHash(plan), requested: WP007D_EXPECTED_REQUEST_COUNT, records: [], failures: [], generationCalls: 0, providerAttempts: 0, retryCount: 0, attemptedCostUsd: 0, flux1ProviderCalls: 0, flux2ProviderCalls: 0, detectorInference: false, training: false, transformations: false, mediaCommittedToGit: false };
  }
}

async function persistManifest(manifestPath, manifest) {
  await writeJson(manifestPath, manifest);
}

function pairsFor(plan, smokeOnly) {
  const camera = plan.sources.filter((source) => source.sourceType === 'CAMERA_NEGATIVE');
  const digital = plan.sources.filter((source) => source.sourceType === 'DIGITAL_NON_AI');
  const selectedSources = smokeOnly ? [camera[0], digital[0]] : plan.sources;
  return selectedSources.flatMap((source) => plan.generators.flatMap((generator) => plan.strengths.map((strength) => ({ source, generator, strength }))));
}

async function execute(options) {
  assertExternalCache(options.outputCache);
  const plan = await readJson(path.join(options.outputCache, 'paired-proxy-plan.json'));
  assertWp007dPlan(plan);
  const planHash = stableWp007dHash(plan);
  const manifestPath = path.join(options.outputCache, 'cloudflare-generation-manifest.json');
  const manifest = await loadManifest(manifestPath, plan);
  const sourceById = new Map(plan.sources.map((source) => [source.sampleId, source]));
  const pairs = pairsFor(plan, options.smokeOnly);
  for (const pair of pairs) {
    const { source, generator, strength } = pair;
    const seed = deriveProxySeed(source.sourceFamilyId, generator.modelId, strength);
    const sampleId = `WP007D_${generator.generatorId}_${source.sampleId}_S${strength.toFixed(2).replace('.', '')}`;
    const existing = manifest.records.find((record) => record.sampleId === sampleId && record.seed === seed && record.generatorModelId === generator.modelId && record.strength === strength && record.canonicalSourceSha256 === source.canonicalSha256);
    if (existing) continue;
    const previousFailure = manifest.failures.find((failure) => failure.sampleId === sampleId);
    if (previousFailure && previousFailure.retryable !== true) continue;
    const canonicalBytes = new Uint8Array(await readFile(path.join(options.outputCache, source.canonicalFile)));
    const body = proxyRequestBody({ modelId: generator.modelId, imageB64: Buffer.from(canonicalBytes).toString('base64'), strength, seed });
    let bytes = null;
    let lastError = null;
    let attemptsForPair = 0;
    while (attemptsForPair <= MAX_RETRIES) {
      attemptsForPair += 1;
      manifest.generationCalls += 1;
      manifest.providerAttempts += 1;
      await persistManifest(manifestPath, manifest);
      try {
        const result = await requestCloudflare(generator.modelId, body);
        bytes = result.bytes;
        break;
      } catch (error) {
        lastError = error;
        if (!error.retryable || attemptsForPair > MAX_RETRIES) break;
        manifest.retryCount += 1;
      }
    }
    if (!bytes) {
      const failure = {
        sampleId,
        sourceFamilyId: source.sourceFamilyId,
        generatorModelId: generator.modelId,
        strength,
        seed,
        contract: 'WP007D_IMG2IMG_V1',
        providerHttpStatus: lastError?.providerHttpStatus ?? null,
        providerErrorCode: lastError?.providerErrorCode ?? null,
        providerErrorMessage: lastError?.providerErrorMessage ?? null,
        failureCategory: lastError?.failureCategory ?? 'UNKNOWN_PROVIDER_ERROR',
        retryable: Boolean(lastError?.retryable),
      };
      manifest.failures = [...manifest.failures.filter((item) => item.sampleId !== sampleId), failure];
      await persistManifest(manifestPath, manifest);
      continue;
    }
    const outputMetadata = await sharp(bytes, { failOn: 'error' }).metadata();
    const outputHash = sha256Bytes(bytes);
    const relativeOutput = `outputs/${generator.generatorId}/${source.sampleId}/strength-${strength.toFixed(2)}.bin`;
    await mkdir(path.dirname(path.join(options.outputCache, relativeOutput)), { recursive: true });
    await writeFile(path.join(options.outputCache, relativeOutput), bytes);
    const record = {
      schemaVersion: 'lythaus-wp007d-generated-proxy-v1',
      sampleId,
      sourceFamilyId: source.sourceFamilyId,
      generatorModelId: generator.modelId,
      generatorFamily: generator.modelFamily,
      generationRoute: 'CLOUDFLARE_WORKERS_AI_IMG2IMG',
      strength: strength.toFixed(2),
      prompt: WP007D_PROXY_PROMPT,
      generationParameters: { ...generator.fixedParameters, strength },
      originalDerivedSeed: seed,
      seed: seed,
      seedState: 'DERIVED_DOCUMENTED_SEED_SUBMITTED',
      contractAmendment: 'WP007D_PROXY_PLAN_V1',
      canonicalSourceSha256: source.canonicalSha256,
      originTruth: 'GENERATIVE_DERIVED_PROXY',
      trainingRole: 'PAIRED_GENERATIVE_PROXY',
      sourceRelationship: 'DERIVED_FROM_CANONICAL_REAL',
      syntheticDepictedContentTruth: 'PROXY_ONLY_NOT_PRIMARY_BENCHMARK_TRUTH',
      rights: { ...source.rights, outputUse: 'PRIVATE_RESEARCH_CLASSIFIER_DEVELOPMENT_ONLY' },
      file: { sha256: outputHash, width: outputMetadata.width ?? null, height: outputMetadata.height ?? null, format: (outputMetadata.format ?? 'UNKNOWN').toUpperCase(), byteSize: bytes.length, cacheId: relativeOutput },
      providerContentType: 'PROVIDER_ORIGINAL_IMAGE_BYTES',
    };
    assertWp007dGeneratedRecord(record);
    manifest.records = [...manifest.records.filter((item) => item.sampleId !== sampleId), record];
    manifest.failures = manifest.failures.filter((item) => item.sampleId !== sampleId);
    manifest.attemptedCostUsd = 0;
    await persistManifest(manifestPath, manifest);
  }
  const final = {
    ...manifest,
    status: options.smokeOnly ? 'WP007D_PROXY_SMOKE_COMPLETE' : 'WP007D_PROXY_MATERIALIZED',
    planSha256: planHash,
    valid: manifest.records.length,
    failed: manifest.failures.length,
    flux1ProviderCalls: 0,
    flux2ProviderCalls: 0,
    flux1PixelAccess: false,
    flux2PixelAccess: false,
    detectorInference: false,
    training: false,
    transformations: false,
    mediaCommittedToGit: false,
    requested: options.smokeOnly ? pairs.length : WP007D_EXPECTED_REQUEST_COUNT,
    uniqueRequested: WP007D_EXPECTED_REQUEST_COUNT,
  };
  await persistManifest(manifestPath, final);
  return final;
}

async function buildTransferManifests(cacheDir) {
  const generation = await readJson(path.join(cacheDir, 'cloudflare-generation-manifest.json'));
  const transfer = {
    schemaVersion: 'lythaus-wp007d-transfer-manifest-v1',
    canonicalPrefix: 'wp007d-paired-proxy/',
    planSha256: generation.planSha256,
    records: generation.records.map((record) => ({ sampleId: record.sampleId, sourceFamilyId: record.sourceFamilyId, generatorModelId: record.generatorModelId, strength: record.strength, cacheId: record.file.cacheId, sha256: record.file.sha256 })),
    failures: generation.failures.map((failure) => ({ sampleId: failure.sampleId, sourceFamilyId: failure.sourceFamilyId, generatorModelId: failure.generatorModelId, strength: failure.strength, failureCategory: failure.failureCategory, providerHttpStatus: failure.providerHttpStatus, providerErrorCode: failure.providerErrorCode, providerErrorMessage: failure.providerErrorMessage })),
    privateArtifact: true,
    retentionDays: 1,
    mediaCommittedToGit: false,
  };
  const shaManifest = { schemaVersion: 'lythaus-wp007d-sha256-manifest-v1', records: generation.records.map((record) => ({ sampleId: record.sampleId, cacheId: record.file.cacheId, sha256: record.file.sha256 })) };
  await writeJson(path.join(cacheDir, 'transfer-manifest.json'), transfer);
  await writeJson(path.join(cacheDir, 'sha256-manifest.json'), shaManifest);
  return { transferCount: transfer.records.length, transferHash: sha256Bytes(new Uint8Array(await readFile(path.join(cacheDir, 'transfer-manifest.json')))) };
}

async function main(options) {
  if (options.mode === 'preflight') return preflight(options);
  if (options.mode === 'execute') {
    const result = await execute(options);
    if (!options.smokeOnly) await buildTransferManifests(options.outputCache);
    return result;
  }
  throw new Error(`wp007d_mode_invalid:${options.mode}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const result = await main(parseArgs(process.argv.slice(2)));
    const schemaFields = ['prompt', 'num_steps', 'seed', 'width', 'height', 'strength', 'guidance', 'image_b64'];
    const failureRecords = Array.isArray(result.failures) ? result.failures.map((failure) => ({
      sampleId: failure.sampleId,
      sourceFamilyId: failure.sourceFamilyId,
      generatorModelId: failure.generatorModelId,
      strength: failure.strength,
      providerHttpStatus: failure.providerHttpStatus ?? null,
      providerErrorCode: failure.providerErrorCode ?? null,
      providerErrorMessage: failure.providerErrorMessage ?? null,
      failureCategory: failure.failureCategory ?? null,
      retryable: Boolean(failure.retryable),
    })) : [];
    const preflightModels = Array.isArray(result.models) ? result.models.map((model) => ({
      generatorId: model.generatorId,
      modelId: model.modelId,
      schemaStatus: model.schemaStatus,
      schemaHttpStatus: model.schemaHttpStatus,
      catalogStatus: model.catalogStatus,
      routeStatus: model.routeStatus,
      providerErrorCode: model.providerErrorCode ?? null,
      providerErrorMessage: model.providerErrorMessage ?? null,
      schema: Object.fromEntries(schemaFields.map((field) => {
        const value = model.schema?.[field];
        return [field, value ? { present: Boolean(value.present), type: value.type ?? null, required: Boolean(value.required), minimum: value.minimum ?? null, maximum: value.maximum ?? null } : null];
      })),
    })) : [];
    console.log(JSON.stringify({
      status: result.status,
      passed: result.passed,
      planSha256: result.planSha256 ?? null,
      requested: result.requested ?? result.uniqueRequested ?? null,
      valid: result.valid ?? null,
      failed: result.failed ?? null,
      generationCalls: result.generationCalls ?? 0,
      providerAttempts: result.providerAttempts ?? 0,
      flux1ProviderCalls: result.flux1ProviderCalls ?? 0,
      flux2ProviderCalls: result.flux2ProviderCalls ?? 0,
      authStatus: result.authStatus ?? null,
      rightsStatus: result.rightsStatus ?? null,
      routeStatus: result.routeStatus ?? null,
      planHashVerified: result.planHashVerified ?? null,
      projectedPaidCostUsd: result.projectedPaidCostUsd ?? null,
      costStatus: result.costStatus ?? null,
      sourceFamilyCount: result.sourceFamilyCount ?? null,
      baseSha: result.baseSha ?? null,
      preflightModels,
      failureRecords,
      credentialsPrinted: false,
    }));
    if (result.passed === false) process.exitCode = 1;
  } catch (error) {
    console.error(`WP007D_STATUS=BLOCKED:${safeErrorMessage(error?.message) ?? 'unknown'}`);
    process.exitCode = 1;
  }
}

export {
  buildPlan,
  canonicalize,
  classifyProviderFailure,
  main,
  parseArgs,
  proxyRequestBody,
  safeErrorMessage,
  zipEntry,
};
