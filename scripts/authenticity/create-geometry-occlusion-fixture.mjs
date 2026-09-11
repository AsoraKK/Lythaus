import path from 'node:path';
import { createGeometryOcclusionPng } from './geometry-occlusion-fixture.mjs';

const outputPath = path.resolve(process.argv[2] ?? '.artifacts/wp004a-geometry-occlusion.png');
const validation = await createGeometryOcclusionPng(outputPath);
console.log(JSON.stringify({ status: 'created', ...validation }));
