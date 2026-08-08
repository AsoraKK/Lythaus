import { argon2id } from '@noble/hashes/argon2';
import { hmac } from '@noble/hashes/hmac';
import { scrypt } from '@noble/hashes/scrypt';
import { sha256 } from '@noble/hashes/sha2';

export const ARGON2ID_PROFILE = { m: 19_456, t: 2, p: 1 } as const;
export const SCRYPT_PROFILE = { N: 2 ** 14, r: 8, p: 5 } as const;
export const PASSWORD_HASH_VERSION = 1 as const;

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function randomBytes(size: number): Uint8Array {
  const result = new Uint8Array(size);
  crypto.getRandomValues(result);
  return result;
}

export function randomToken(size = 32): string {
  const bytes = randomBytes(size);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function pepperDigest(hash: Uint8Array, pepper: string): Uint8Array {
  return hmac(sha256, new TextEncoder().encode(pepper), hash);
}

export interface PasswordHash {
  algorithm: 'argon2id' | 'scrypt';
  version: typeof PASSWORD_HASH_VERSION;
  salt: string;
  digest: string;
  pepperVersion: string;
}

export interface EncryptedField {
  ciphertext: string;
  encryptionKeyVersion: string;
}

export function hashPassword(
  password: string,
  pepper: string,
  options: { fallbackToScrypt?: boolean; pepperVersion?: string } = {}
): PasswordHash {
  const salt = randomBytes(16);
  let algorithm: PasswordHash['algorithm'] = 'argon2id';
  let derived: Uint8Array;
  try {
    derived = argon2id(password, salt, { ...ARGON2ID_PROFILE, dkLen: 32 });
  } catch (error) {
    if (!options.fallbackToScrypt) throw error;
    algorithm = 'scrypt';
    derived = scrypt(password, salt, { ...SCRYPT_PROFILE, dkLen: 32 });
  }
  return {
    algorithm,
    version: PASSWORD_HASH_VERSION,
    salt: encode(salt),
    digest: encode(pepperDigest(derived, pepper)),
    pepperVersion: options.pepperVersion ?? 'v1',
  };
}

export function needsPasswordRehash(stored: PasswordHash, pepperVersion = 'v1'): boolean {
  return stored.algorithm !== 'argon2id'
    || stored.version !== PASSWORD_HASH_VERSION
    || stored.pepperVersion !== pepperVersion;
}

export function verifyPassword(password: string, stored: PasswordHash, pepper: string): boolean {
  const salt = decode(stored.salt);
  const derived = stored.algorithm === 'argon2id'
    ? argon2id(password, salt, { ...ARGON2ID_PROFILE, dkLen: 32 })
    : scrypt(password, salt, { ...SCRYPT_PROFILE, dkLen: 32 });
  return constantTimeEqual(pepperDigest(derived, pepper), decode(stored.digest));
}

export function hashResetToken(token: string): string {
  return encode(sha256(token));
}

export function hmacLookup(value: string, key: string): string {
  return encode(hmac(sha256, new TextEncoder().encode(key), value.trim().toLowerCase()));
}

function decodeKey(value: string): Uint8Array {
  const decoded = decode(value);
  if (decoded.byteLength !== 32) throw new Error('aes256_key_required');
  return decoded;
}

export async function encryptField(plaintext: string, base64Key: string, encryptionKeyVersion: string): Promise<EncryptedField> {
  const key = await crypto.subtle.importKey('raw', decodeKey(base64Key), { name: 'AES-GCM' }, false, ['encrypt']);
  const nonce = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, new TextEncoder().encode(plaintext));
  return { ciphertext: `${encode(nonce)}.${encode(new Uint8Array(ciphertext))}`, encryptionKeyVersion };
}

export async function decryptField(field: EncryptedField, base64Key: string): Promise<string> {
  const [encodedNonce, encodedCiphertext] = field.ciphertext.split('.');
  if (!encodedNonce || !encodedCiphertext) throw new Error('encrypted_field_invalid');
  const key = await crypto.subtle.importKey('raw', decodeKey(base64Key), { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(encodedNonce) }, key, decode(encodedCiphertext));
  return new TextDecoder().decode(plaintext);
}

export { signAccessToken, verifyAccessToken, type Principal } from './jwt';
export { uuidv7 } from './uuidv7';
