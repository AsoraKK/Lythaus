import { fileURLToPath } from 'node:url';
import path from 'node:path';

function validateGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== 64 || grid.some((value) => !Number.isFinite(value))) throw new Error('grid must contain exactly 64 finite numeric values');
  return grid.map(Number);
}

function dct1(values) {
  const result = [];
  for (let k = 0; k < 8; k += 1) {
    let total = 0;
    for (let n = 0; n < 8; n += 1) total += values[n] * Math.cos((Math.PI / 8) * (n + 0.5) * k);
    result.push((k === 0 ? Math.sqrt(1 / 8) : Math.sqrt(2 / 8)) * total);
  }
  return result;
}

export function dct2d(gridInput) {
  const grid = validateGrid(gridInput);
  const rows = Array.from({ length: 8 }, (_, row) => dct1(grid.slice(row * 8, row * 8 + 8)));
  const output = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let column = 0; column < 8; column += 1) {
    const transformed = dct1(rows.map((row) => row[column]));
    for (let row = 0; row < 8; row += 1) output[row][column] = transformed[row];
  }
  return output;
}

export function dftSummary(gridInput) {
  const grid = validateGrid(gridInput);
  let magnitudeTotal = 0;
  let phaseTotal = 0;
  let nonDc = 0;
  for (let ky = 0; ky < 8; ky += 1) {
    for (let kx = 0; kx < 8; kx += 1) {
      let real = 0;
      let imaginary = 0;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const angle = (-2 * Math.PI * ((kx * x / 8) + (ky * y / 8)));
          const value = grid[y * 8 + x];
          real += value * Math.cos(angle);
          imaginary += value * Math.sin(angle);
        }
      }
      const magnitude = Math.hypot(real, imaginary);
      const phase = Math.atan2(imaginary, real) / Math.PI;
      magnitudeTotal += magnitude;
      phaseTotal += Math.abs(phase);
      if (kx !== 0 || ky !== 0) nonDc += magnitude;
    }
  }
  return {
    meanMagnitude: magnitudeTotal / 64,
    meanAbsolutePhase: phaseTotal / 64,
    nonDcMagnitude: nonDc,
  };
}

export function summarizeGrid(grid) {
  const dct = dct2d(grid);
  return {
    schemaVersion: 'lythaus-wp007j-phase-dct-measurement-v1',
    measurementOnly: true,
    classifierInvoked: false,
    dctDc: dct[0][0],
    dctAcL1: dct.flat().slice(1).reduce((sum, value) => sum + Math.abs(value), 0),
    dft: dftSummary(grid),
    evidenceRole: 'EF4_MEASUREMENT_CANDIDATE_ONLY',
    productAuthority: 'NONE',
  };
}

async function main() {
  const gridIndex = process.argv.indexOf('--grid');
  if (gridIndex < 0 || !process.argv[gridIndex + 1]) throw new Error('usage: node wp007j_phase_dct_probe.mjs --grid <json-array>');
  console.log(JSON.stringify(summarizeGrid(JSON.parse(process.argv[gridIndex + 1])), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
