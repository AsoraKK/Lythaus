import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes);
  body.set(data, typeBytes.length);
  const output = new Uint8Array(12 + data.length);
  new DataView(output.buffer).setUint32(0, data.length);
  output.set(body, 4);
  new DataView(output.buffer).setUint32(8 + data.length, crc32(body));
  return output;
}

function concat(...parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

const outputPath = path.resolve(process.argv[2] ?? '.artifacts/wp004a-neutral.png');
const header = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = new Uint8Array(13);
const ihdrView = new DataView(ihdr.buffer);
ihdrView.setUint32(0, 2);
ihdrView.setUint32(4, 2);
ihdr[8] = 8;
ihdr[9] = 2;
const rawPixels = new Uint8Array([
  0, 238, 238, 238, 238, 238, 238, 238,
  0, 238, 238, 238, 238, 238, 238, 238,
]);
const compressed = deflateSync(rawPixels, { level: 9 });
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, concat(header, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())));
console.log(JSON.stringify({ status: 'created', format: 'PNG', width: 2, height: 2 }));
