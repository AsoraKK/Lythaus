import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  createGeometryOcclusionFrontBackPng,
  GEOMETRY_FRONTBACK_FIXTURE_IDS,
  GEOMETRY_FRONTBACK_RUNTIME_FILENAMES,
  GEOMETRY_FRONTBACK_VARIANTS,
} from './geometry-occlusion-frontback-fixtures.mjs';

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error('geometry_frontback_output_directory_required');
const resolvedDirectory = path.resolve(outputDirectory);
await mkdir(resolvedDirectory, { recursive: true });
const fixtures = [];
for (const front of GEOMETRY_FRONTBACK_VARIANTS) {
  const validation = await createGeometryOcclusionFrontBackPng(path.join(resolvedDirectory, GEOMETRY_FRONTBACK_RUNTIME_FILENAMES[front]), front);
  fixtures.push({
    sampleId: GEOMETRY_FRONTBACK_FIXTURE_IDS[front],
    format: validation.format,
    width: validation.width,
    height: validation.height,
    sha256: validation.sha256,
  });
}
console.log(JSON.stringify({ schemaVersion: 'lythaus-wp004a-frontback-fixture-generation-v2', status: 'created', fixtures }));
