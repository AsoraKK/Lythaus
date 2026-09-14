import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sha256Hex } from '../../packages/authenticity/src/wp007a.ts';

export const PROGRAMMATIC_NEGATIVE_TYPES = Object.freeze([
  'CHART',
  'DIAGRAM',
  'TEXT_GRAPHIC',
  'VECTOR_GRAPHIC',
  'UI_CAPTURE',
  'OTHER_DIGITAL_NON_AI',
]);
export const PROGRAMMATIC_NEGATIVE_COUNT_PER_TYPE = 8;
export const PROGRAMMATIC_NEGATIVE_TOTAL = PROGRAMMATIC_NEGATIVE_TYPES.length * PROGRAMMATIC_NEGATIVE_COUNT_PER_TYPE;

function assertExternalCache(cacheDir) {
  if (!path.isAbsolute(cacheDir)) throw new Error('wp007a_hard_negative_cache_must_be_absolute');
  const relative = path.relative(path.resolve(process.cwd()), path.resolve(cacheDir));
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) throw new Error('wp007a_hard_negative_cache_inside_repository');
}

function color(index, channel) {
  return ((index * (channel === 0 ? 47 : channel === 1 ? 71 : 97) + channel * 53 + 43) % 200) + 30;
}

function svgFor(type, index) {
  const accent = `rgb(${color(index, 0)},${color(index, 1)},${color(index, 2)})`;
  const secondary = `rgb(${color(index + 2, 0)},${color(index + 2, 1)},${color(index + 2, 2)})`;
  const label = `${type.replaceAll('_', ' ')} ${String(index + 1).padStart(2, '0')}`;
  const shared = `<rect width="1024" height="1024" fill="#f7f7f4"/><text x="48" y="970" font-family="sans-serif" font-size="24" fill="#343434">${label}</text>`;
  if (type === 'CHART') {
    const bars = Array.from({ length: 8 }, (_, bar) => `<rect x="${96 + bar * 100}" y="${720 - ((bar * 71 + index * 19) % 390)}" width="58" height="${80 + ((bar * 71 + index * 19) % 390)}" fill="${bar % 2 ? accent : secondary}"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${shared}<line x1="80" y1="760" x2="900" y2="760" stroke="#333" stroke-width="4"/><line x1="80" y1="150" x2="80" y2="760" stroke="#333" stroke-width="4"/>${bars}<text x="90" y="110" font-family="sans-serif" font-size="42" font-weight="bold">Quarterly comparison</text></svg>`;
  }
  if (type === 'DIAGRAM') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${shared}<text x="110" y="120" font-family="sans-serif" font-size="38">Process map</text><rect x="120" y="260" width="220" height="120" rx="18" fill="${accent}"/><rect x="684" y="260" width="220" height="120" rx="18" fill="${secondary}"/><rect x="402" y="590" width="220" height="120" rx="18" fill="#d8d8d0"/><path d="M340 320H684M794 380L520 590M450 590L230 380" stroke="#333" stroke-width="8" fill="none" marker-end="url(#a)"/><defs><marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0 0L9 3L0 6Z" fill="#333"/></marker></defs><text x="170" y="330" font-family="sans-serif" font-size="28">Input</text><text x="730" y="330" font-family="sans-serif" font-size="28">Review</text><text x="445" y="660" font-family="sans-serif" font-size="28">Result</text></svg>`;
  }
  if (type === 'TEXT_GRAPHIC') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${shared}<rect x="80" y="80" width="864" height="720" fill="white" stroke="${accent}" stroke-width="14"/><text x="130" y="220" font-family="sans-serif" font-size="68" font-weight="bold">FIELD NOTES</text><text x="130" y="330" font-family="serif" font-size="42">A short printed notice</text><text x="130" y="430" font-family="sans-serif" font-size="30">Line ${index + 1}: measured and recorded.</text><text x="130" y="500" font-family="sans-serif" font-size="30">Keep this reference near the desk.</text><line x1="130" y1="590" x2="850" y2="590" stroke="${secondary}" stroke-width="8"/><text x="130" y="690" font-family="monospace" font-size="34">REF-${String(index + 1).padStart(3, '0')}</text></svg>`;
  }
  if (type === 'VECTOR_GRAPHIC') {
    const circles = Array.from({ length: 6 }, (_, circle) => `<circle cx="${220 + (circle % 3) * 300}" cy="${250 + Math.floor(circle / 3) * 300}" r="${70 + ((index + circle) % 4) * 16}" fill="${circle % 2 ? secondary : accent}" opacity="0.78"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${shared}<rect x="80" y="80" width="864" height="760" fill="#20232a"/>${circles}<path d="M140 720L450 160L880 770" stroke="#fff" stroke-width="13" fill="none"/><text x="116" y="130" font-family="sans-serif" font-size="36" fill="white">Geometric study</text></svg>`;
  }
  if (type === 'UI_CAPTURE') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${shared}<rect x="70" y="70" width="884" height="760" rx="18" fill="#eef1f4" stroke="#68717a" stroke-width="5"/><rect x="70" y="70" width="884" height="84" rx="18" fill="${accent}"/><circle cx="112" cy="112" r="12" fill="white"/><circle cx="150" cy="112" r="12" fill="white"/><circle cx="188" cy="112" r="12" fill="white"/><rect x="130" y="245" width="310" height="340" rx="12" fill="white" stroke="#c5cad0"/><rect x="500" y="245" width="310" height="58" rx="8" fill="white"/><rect x="500" y="335" width="310" height="58" rx="8" fill="white"/><rect x="500" y="425" width="170" height="58" rx="8" fill="${secondary}"/><text x="118" y="210" font-family="sans-serif" font-size="32">Dashboard preview</text></svg>`;
  }
  const blocks = Array.from({ length: 7 }, (_, block) => `<rect x="${110 + (block % 3) * 280}" y="${170 + Math.floor(block / 3) * 220}" width="210" height="130" fill="${block % 2 ? accent : secondary}" opacity="0.86"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${shared}<text x="100" y="110" font-family="sans-serif" font-size="40">Structured layout ${index + 1}</text>${blocks}<path d="M110 840H900" stroke="#333" stroke-width="8"/></svg>`;
}

export async function materializeProgrammaticNegatives({ cacheDir, countPerType = PROGRAMMATIC_NEGATIVE_COUNT_PER_TYPE } = {}) {
  const target = cacheDir ?? path.join(os.homedir(), 'OneDrive', 'Desktop', 'Lythaus_AI_Datasets', '90_RESEARCH_ONLY', 'wp007a-hard-negative-cache');
  assertExternalCache(target);
  if (!Number.isInteger(countPerType) || countPerType < 1 || countPerType > 16) throw new Error('wp007a_programmatic_negative_count_invalid');
  await mkdir(target, { recursive: true });
  const records = [];
  for (const type of PROGRAMMATIC_NEGATIVE_TYPES) {
    for (let index = 0; index < countPerType; index += 1) {
      const content = svgFor(type, index);
      const sampleId = `PNGN_${type}_${String(index + 1).padStart(2, '0')}`;
      const fileName = `${sampleId}.svg`;
      const filePath = path.join(target, fileName);
      const hash = sha256Hex(content);
      const existing = await readFile(filePath, 'utf8').catch(() => null);
      if (existing !== content) await writeFile(filePath, content, 'utf8');
      const bytes = (await stat(filePath)).size;
      records.push({
        sampleId,
        sourceFamilyId: `LYTHAUS-PROGRAMMATIC-HN-${type}-${String(index + 1).padStart(2, '0')}`,
        artifactTruth: {
          physicalCameraAcquisition: 'FALSE',
          syntheticDepictedContent: 'FALSE',
          localManipulation: 'FALSE',
          digitalCapture: 'TRUE',
          screenRecapture: 'FALSE',
        },
        provenance: {
          provider: 'LYTHAUS',
          product: 'PROGRAMMATIC_DIGITAL_NEGATIVE_FIXTURE',
          generatorFamily: 'NONE_NON_GENERATIVE',
          generatorModel: 'NONE',
          generatorVersion: 'NONE',
          generationRoute: 'LOCAL_DETERMINISTIC_RENDERER',
          truthSource: 'DERIVED_DETERMINISTICALLY_FROM_RENDERING_CODE',
          renderingCode: 'scripts/authenticity/wp007a-build-hard-negatives.mjs',
          renderingConfiguration: { width: 1024, height: 1024, format: 'SVG', type, index },
        },
        rights: {
          sourceMediaRights: 'LYTHAUS_CONTROLLED',
          trainingEligibility: 'TRAINING_ALLOWED_EXPLICIT',
          evaluationEligibility: true,
          publicRedistribution: 'NOT_AUTHORIZED',
        },
        file: { sha256: hash, width: 1024, height: 1024, format: 'SVG', byteSize: bytes, cacheId: `wp007a-hard-negative-cache/${fileName}` },
        benchmark: { role: 'DEVELOPMENT', hardNegativeSubtype: type, promptTaxonomy: null, mixedOrigin: false, duplicateGroupId: null, nearDuplicateReviewStatus: 'NOT_FOUND' },
        researchRole: 'PROGRAMMATIC_DIGITAL_NON_AI_CONTROL',
      });
    }
  }
  const result = { schemaVersion: 'lythaus-wp007a-programmatic-negative-manifest-v1', familyCount: records.length, records };
  await writeFile(path.join(target, 'manifest.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const cacheDir = process.argv.includes('--cache-dir') ? path.resolve(process.argv[process.argv.indexOf('--cache-dir') + 1]) : undefined;
  const result = await materializeProgrammaticNegatives({ cacheDir });
  console.log(JSON.stringify({ status: 'materialized', familyCount: result.familyCount }));
}
