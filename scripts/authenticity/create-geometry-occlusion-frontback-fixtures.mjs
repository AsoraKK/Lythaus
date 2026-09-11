import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  createGeometryOcclusionFrontBackPng,
  GEOMETRY_FRONTBACK_VARIANTS,
} from './geometry-occlusion-frontback-fixtures.mjs';

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error('geometry_frontback_output_directory_required');
const resolvedDirectory = path.resolve(outputDirectory);
await mkdir(resolvedDirectory, { recursive: true });
const outputs = {};
for (const front of GEOMETRY_FRONTBACK_VARIANTS) {
  outputs[front] = await createGeometryOcclusionFrontBackPng(path.join(resolvedDirectory, `${front.toLowerCase()}-front.png`), front);
}
console.log(JSON.stringify({ schemaVersion: 'lythaus-wp004a-frontback-fixture-generation-v1', outputs }));
