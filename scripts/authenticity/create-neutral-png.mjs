import path from 'node:path';
import { createNeutralPng } from './neutral-png.mjs';

const outputPath = path.resolve(process.argv[2] ?? '.artifacts/wp004a-neutral.png');
const validation = await createNeutralPng(outputPath);
console.log(JSON.stringify({ status: 'created', ...validation }));
