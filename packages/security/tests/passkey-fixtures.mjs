import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

export function syntheticAuthenticator({ multiDevice = false, counter = 0 } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const id = randomBytes(32).toString('base64url');
  const cose = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
  function authenticatorData(rpId, count, flags) {
    const encodedCount = Buffer.alloc(4);
    encodedCount.writeUInt32BE(count);
    return Buffer.concat([createHash('sha256').update(rpId).digest(), Buffer.from([flags]), encodedCount]);
  }
  function clientData(options, origin, type, extra = {}) {
    return Buffer.from(JSON.stringify({ type, challenge: options.challenge, origin, crossOrigin: false, ...extra }));
  }
  return {
    id, cose, privateKey,
    registration(options, { origin = 'https://app.lythaus.co', rpId = options.rp.id, uv = true, extra = {} } = {}) {
      const idBytes = Buffer.from(id, 'base64url');
      const length = Buffer.alloc(2);
      length.writeUInt16BE(idBytes.length);
      const authData = Buffer.concat([authenticatorData(rpId, counter, 0x41 | (uv ? 4 : 0) | (multiDevice ? 24 : 0)), Buffer.alloc(16), length, idBytes, cose]);
      return { id, rawId: id, type: 'public-key', response: {
        clientDataJSON: clientData(options, origin, 'webauthn.create', extra).toString('base64url'),
        attestationObject: Buffer.from(isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))).toString('base64url'), transports: ['internal'],
      }, clientExtensionResults: {} };
    },
    assertion(options, userHandle, { origin = 'https://app.lythaus.co', rpId = options.rpId, uv = true, count = counter + 1, extra = {} } = {}) {
      const authData = authenticatorData(rpId, count, 1 | (uv ? 4 : 0) | (multiDevice ? 24 : 0));
      const data = clientData(options, origin, 'webauthn.get', extra);
      const signature = sign('sha256', Buffer.concat([authData, createHash('sha256').update(data).digest()]), privateKey);
      return { id, rawId: id, type: 'public-key', response: { authenticatorData: authData.toString('base64url'), clientDataJSON: data.toString('base64url'), signature: signature.toString('base64url'), userHandle }, clientExtensionResults: {} };
    },
  };
}
