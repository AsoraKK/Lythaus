export interface DatabaseSchemaIdentityTuple {
  schemaVersion: string;
  schemaFingerprint: string;
  relationCount: number;
}

export interface DatabaseSchemaIdentityAllowlist {
  configured: boolean;
  valid: boolean;
  identities: DatabaseSchemaIdentityTuple[];
}

export function parseDatabaseSchemaIdentityAllowlist(raw: string | undefined): DatabaseSchemaIdentityAllowlist {
  if (raw === undefined || raw.trim() === '') return { configured: false, valid: true, identities: [] };
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded) || decoded.length === 0 || decoded.length > 4) {
      return { configured: true, valid: false, identities: [] };
    }
    const identities: DatabaseSchemaIdentityTuple[] = [];
    const keys = new Set<string>();
    for (const candidate of decoded) {
      if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
        return { configured: true, valid: false, identities: [] };
      }
      const value = candidate as Record<string, unknown>;
      if (Object.keys(value).sort().join(',') !== 'relationCount,schemaFingerprint,schemaVersion'
        || typeof value.schemaVersion !== 'string'
        || !/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(value.schemaVersion)
        || typeof value.schemaFingerprint !== 'string'
        || !/^[0-9a-f]{64}$/.test(value.schemaFingerprint)
        || typeof value.relationCount !== 'number'
        || !Number.isInteger(value.relationCount)
        || value.relationCount <= 0) {
        return { configured: true, valid: false, identities: [] };
      }
      const tuple = {
        schemaVersion: value.schemaVersion,
        schemaFingerprint: value.schemaFingerprint,
        relationCount: value.relationCount,
      };
      const key = `${tuple.schemaVersion}\n${tuple.schemaFingerprint}\n${tuple.relationCount}`;
      if (keys.has(key)) return { configured: true, valid: false, identities: [] };
      keys.add(key);
      identities.push(tuple);
    }
    return { configured: true, valid: true, identities };
  } catch {
    return { configured: true, valid: false, identities: [] };
  }
}

export function isDatabaseSchemaIdentityAllowed(
  report: DatabaseSchemaIdentityTuple,
  expected: DatabaseSchemaIdentityTuple & { schemaIdentityAllowlist?: DatabaseSchemaIdentityAllowlist },
): boolean {
  const allowlist = expected.schemaIdentityAllowlist;
  if (allowlist?.configured) {
    return allowlist.valid && allowlist.identities.some((identity) => (
      report.schemaVersion === identity.schemaVersion
      && report.schemaFingerprint === identity.schemaFingerprint
      && report.relationCount === identity.relationCount
    ));
  }
  return report.schemaVersion === expected.schemaVersion
    && report.schemaFingerprint === expected.schemaFingerprint
    && report.relationCount === expected.relationCount;
}
