import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const FLUX2 = ['flux.2', 'flux2', 'flux-2'];
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (!value.startsWith('--')) return pairs;
  pairs.push([value.slice(2), all[index + 1] && !all[index + 1].startsWith('--') ? all[index + 1] : true]);
  return pairs;
}, []));
const root = (key) => path.resolve(args[key]);
const cohort = JSON.parse(await readFile(args.cohort, 'utf8'));
if (cohort.flux2PixelAccess || cohort.flux2ProviderCalls !== 0) throw new Error('COHORT_NOT_SEALED');
const roots = {
  WP007H_MODERN: root('h-root'),
  WP007E_CONTROLLED_DIGITAL: root('controlled-root'),
  WP007I_MEDIA: root('media-root'),
};
const output = root('output');
await mkdir(output, { recursive: true });
const records = [];
const negativeParents = cohort.records.filter((item) => item.label === 0).sort((a, b) => a.sampleId.localeCompare(b.sampleId));
const transformNegativeIds = new Set(negativeParents.slice(0, 160).map((item) => item.sampleId));
const transformSelection = {
  rule: 'All synthetic confirmation parents; first 160 negative parents by sampleId. Every confirmation parent retains an ORIGINAL record.',
  negativeLimit: 160,
  negativeIdsSha256: sha256(Buffer.from([...transformNegativeIds].sort().join('\n'))),
};
for (const item of cohort.records) {
  const text = `${item.generatorFamily || ''} ${item.relativePath}`.toLowerCase();
  if (FLUX2.some((marker) => text.includes(marker))) throw new Error(`FLUX2_ACCESS_DENIED:${text}`);
  const source = path.join(roots[item.rootKey], item.relativePath);
  const sourceBuffer = await readFile(source);
  if (item.expectedSha256 && sha256(sourceBuffer) !== item.expectedSha256 && item.rootKey !== 'WP007E_CONTROLLED_DIGITAL') throw new Error(`SOURCE_HASH_MISMATCH:${item.sampleId}`);
  const ext = path.extname(source).toLowerCase();
  const originalRelative = `original/${item.sampleId}${ext === '.bin' ? '.jpg' : ext === '.svg' ? '.png' : ext}`;
  const originalPath = path.join(output, originalRelative);
  await mkdir(path.dirname(originalPath), { recursive: true });
  if (ext === '.svg') await sharp(source).png().toFile(originalPath);
  else await copyFile(source, originalPath);
  const originalBytes = await readFile(originalPath);
  records.push({ recordId: `${item.sampleId}__ORIGINAL`, parentSampleId: item.sampleId, sourceFamilyId: item.sourceFamilyId, generatorFamily: item.generatorFamily, truthLabel: item.label, role: item.role, sourceSubtype: item.sourceSubtype, operation: 'ORIGINAL', encoder: 'ORIGINAL_SOURCE', requestedQuality: null, requestedSubsampling: null, rootKey: 'MATERIALIZED', relativePath: originalRelative, sha256: sha256(originalBytes), split: item.split });
  if (item.label === 0 && !transformNegativeIds.has(item.sampleId)) continue;
  const jobs = [
    ['Q95_420', 95, '4:2:0'], ['Q85_420', 85, '4:2:0'], ['Q75_420', 75, '4:2:0'], ['Q95_444', 95, '4:4:4'],
  ];
  for (const [operation, quality, chromaSubsampling] of jobs) {
    const relative = `sharp/${operation}/${item.sampleId}.jpg`;
    const target = path.join(output, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await sharp(source).jpeg({ quality, chromaSubsampling }).toFile(target);
    const bytes = await readFile(target);
    records.push({ recordId: `${item.sampleId}__${operation}__SHARP`, parentSampleId: item.sampleId, sourceFamilyId: item.sourceFamilyId, generatorFamily: item.generatorFamily, truthLabel: item.label, role: item.role, sourceSubtype: item.sourceSubtype, operation, encoder: 'SHARP_LIBVIPS', requestedQuality: quality, requestedSubsampling: chromaSubsampling, rootKey: 'MATERIALIZED', relativePath: relative, sha256: sha256(bytes), split: item.split });
  }
  if (item.label === 1) {
    const relative = `sharp/DOUBLE_Q95_Q85/${item.sampleId}.jpg`;
    const target = path.join(output, relative);
    await mkdir(path.dirname(target), { recursive: true });
    const first = await sharp(source).jpeg({ quality: 95, chromaSubsampling: '4:2:0' }).toBuffer();
    await sharp(first).jpeg({ quality: 85, chromaSubsampling: '4:2:0' }).toFile(target);
    const bytes = await readFile(target);
    records.push({ recordId: `${item.sampleId}__DOUBLE_Q95_Q85__SHARP`, parentSampleId: item.sampleId, sourceFamilyId: item.sourceFamilyId, generatorFamily: item.generatorFamily, truthLabel: item.label, role: item.role, sourceSubtype: item.sourceSubtype, operation: 'DOUBLE_Q95_Q85', encoder: 'SHARP_LIBVIPS', requestedQuality: 85, requestedSubsampling: '4:2:0', rootKey: 'MATERIALIZED', relativePath: relative, sha256: sha256(bytes), split: item.split });
  }
}
const payload = { schemaVersion: 'lythaus-wp007k-base-materialization-v1', sourceCohortFreezeSha256: cohort.freezeSha256, scoreBlind: true, transformSelection, records, flux2PixelAccess: false, flux2ProviderCalls: 0 };
payload.baseMaterializationSha256 = sha256(Buffer.from(canonical(payload)));
await writeFile(path.join(output, 'base-materialization-manifest.json'), JSON.stringify(payload, null, 2) + '\n');
console.log(JSON.stringify({ records: records.length, sourceParents: cohort.records.length, baseMaterializationSha256: payload.baseMaterializationSha256 }));
