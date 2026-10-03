'use strict';

const defaultStatuses = new Set([200, 203, 204, 300, 301, 308, 404, 405, 410, 414, 501]);
const understoodStatuses = new Set([...defaultStatuses, 302, 303, 307]);
const bareDirectives = new Set(['public', 'immutable', 'must-revalidate', 'proxy-revalidate', 'no-store', 'no-transform', 'only-if-cached']);

function headers(values) {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name.toLowerCase(), String(value)]));
}

function directives(value) {
  const result = Object.create(null);
  if (!value) return result;
  for (const part of value.split(',')) {
    const match = part.trim().match(/^([a-z0-9!#$%&'*+.^_`|~-]+)(?:\s*=\s*(?:"([^"]*)"|([^\s"]+)))?$/i);
    if (!match) return null;
    const name = match[1].toLowerCase();
    if (Object.hasOwn(result, name)) return null;
    const argument = match[2] ?? match[3] ?? true;
    if (bareDirectives.has(name) && argument !== true) return null;
    result[name] = argument;
  }
  return result;
}

function seconds(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

module.exports = class AstroCachePolicy {
  constructor(request, response, options = {}) {
    if (!request?.headers || !response?.headers) throw new Error('Request and response headers are required');
    if (Object.keys(options).length) throw new Error('Astro cache policy supports only the pinned loader default options');
    this.receivedAt = Date.now();
    this.requestHeaders = headers(request.headers);
    this.responseHeaders = headers(response.headers);
    this.requestControl = directives(this.requestHeaders['cache-control']);
    this.responseControl = directives(this.responseHeaders['cache-control']);
    this.method = request.method ?? 'GET';
    this.status = response.status ?? 200;
  }

  storable() {
    const req = this.requestControl;
    const res = this.responseControl;
    if (!req || !res || Object.hasOwn(req, 'no-store') || ['no-store', 'private', 'no-cache', 'proxy-revalidate'].some(name => Object.hasOwn(res, name))) return false;
    if (!['GET', 'HEAD'].includes(this.method) || !understoodStatuses.has(this.status)) return false;
    if (this.responseHeaders.vary?.split(',').some(value => value.trim() === '*')) return false;
    if (this.responseHeaders['set-cookie'] && res.public !== true) return false;
    if (!this.responseHeaders['cache-control'] && /\bno-cache\b/i.test(this.responseHeaders.pragma ?? '')) return false;
    if (this.requestHeaders.authorization && !(res.public === true || res['s-maxage'] !== undefined || res['must-revalidate'] === true)) return false;
    return Boolean(defaultStatuses.has(this.status) || res.public === true || res['max-age'] !== undefined || res['s-maxage'] !== undefined || this.responseHeaders.expires);
  }

  timeToLive() {
    if (!this.storable()) return 0;
    const res = this.responseControl;
    const age = this.responseHeaders.age === undefined ? 0 : seconds(this.responseHeaders.age);
    if (age === null) return 0;
    const parsedDate = Date.parse(this.responseHeaders.date);
    const date = Number.isFinite(parsedDate) ? parsedDate : this.receivedAt;
    const initialAge = Math.max(age, Math.max(0, this.receivedAt - date) / 1000);
    let lifetime;
    if (res['s-maxage'] !== undefined || res['max-age'] !== undefined) {
      lifetime = seconds(res['s-maxage'] ?? res['max-age']);
      if (lifetime === null) return 0;
    } else {
      const immutable = res.immutable ? 86_400 : 0;
      if (this.responseHeaders.expires !== undefined) {
        const expires = Date.parse(this.responseHeaders.expires);
        if (!Number.isFinite(expires) || expires < date) return 0;
        lifetime = (expires - date) / 1000;
      } else {
        const modified = Date.parse(this.responseHeaders['last-modified']);
        lifetime = Number.isFinite(modified) && modified < date ? (date - modified) / 10_000 : immutable;
      }
    }
    const remaining = lifetime - initialAge - Math.max(0, Date.now() - this.receivedAt) / 1000;
    const milliseconds = Math.round(Math.max(0, remaining) * 1000);
    return Number.isSafeInteger(milliseconds) ? milliseconds : 0;
  }
};
