const invalidTokenPairMessage = 'PLANETSCALE_API_TOKEN must contain the service-token ID and token separated by a single colon';

export function planetScaleServiceTokenAuthorizationHeader(value) {
  if (typeof value !== 'string' || value.length === 0 || /[\s\x00-\x1f\x7f-\x9f]/.test(value)) {
    throw new Error(invalidTokenPairMessage);
  }

  const separator = value.indexOf(':');
  if (separator <= 0 || separator !== value.lastIndexOf(':') || separator === value.length - 1) {
    throw new Error(invalidTokenPairMessage);
  }

  return value;
}
