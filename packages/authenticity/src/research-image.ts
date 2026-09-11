export const RESEARCH_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export type ResearchImageMime = (typeof RESEARCH_IMAGE_MIME_TYPES)[number];

export const DEFAULT_RESEARCH_IMAGE_SIZE_LIMIT = 10 * 1024 * 1024;

export function normalizeResearchMime(value: string): string {
  return value.split(';', 1)[0].trim().toLowerCase();
}

export function isResearchImageMime(value: string): value is ResearchImageMime {
  return (RESEARCH_IMAGE_MIME_TYPES as readonly string[]).includes(normalizeResearchMime(value));
}

export function assertResearchImageInput(input: { bytes: Uint8Array; mime: string; maxBytes?: number }): ResearchImageMime {
  const mime = normalizeResearchMime(input.mime);
  const maxBytes = input.maxBytes ?? DEFAULT_RESEARCH_IMAGE_SIZE_LIMIT;
  if (!isResearchImageMime(mime)) throw new Error('research_image_mime_invalid');
  if (input.bytes.byteLength === 0) throw new Error('research_image_empty');
  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || input.bytes.byteLength > maxBytes) throw new Error('research_image_size_limit_exceeded');
  return mime;
}

function binaryString(bytes: Uint8Array): string {
  let output = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
  }
  return output;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(binaryString(bytes));
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  const normalized = normalizeResearchMime(mime);
  return `data:${normalized};base64,${bytesToBase64(bytes)}`;
}

export function mimeFromResearchFilename(filename: string): string {
  const extension = filename.toLowerCase().split('.').pop() ?? '';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'avif') return 'image/avif';
  return 'application/octet-stream';
}
