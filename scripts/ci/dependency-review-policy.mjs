const DEPENDENCY_GRAPH_FIELDS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'bundledDependencies',
  'overrides',
  'workspaces',
  'packageManager',
]);

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, normalize(nested)]));
  }
  return value;
}

export function dependencyGraphMetadata(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;
  return Object.fromEntries(DEPENDENCY_GRAPH_FIELDS
    .map((field) => [field, normalize(manifest[field] ?? null)]));
}

export function dependencyGraphChanged(before, after) {
  return JSON.stringify(dependencyGraphMetadata(before)) !== JSON.stringify(dependencyGraphMetadata(after));
}

export function shouldRunLocalAudit({ changedNpmDependencyManifests = [], changedNpmLocks = [] } = {}) {
  if (!Array.isArray(changedNpmDependencyManifests) || !Array.isArray(changedNpmLocks)) {
    throw new TypeError('dependency review change lists must be arrays');
  }
  return changedNpmDependencyManifests.length > 0 || changedNpmLocks.length > 0;
}
