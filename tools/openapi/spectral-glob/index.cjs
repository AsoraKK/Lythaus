const { glob } = require('glob');

module.exports = async function spectralGlob(patterns, options = {}) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  if (list.some(pattern => typeof pattern !== 'string')) throw new TypeError('Glob patterns must be strings');
  const negative = pattern => pattern.startsWith('!') && !pattern.startsWith('!(');
  const included = list.filter(pattern => !negative(pattern));
  const excluded = list.filter(negative).map(pattern => pattern.slice(1));
  if (!included.length) return [];
  return glob(included, {
    cwd: options.cwd,
    absolute: options.absolute === true,
    dot: options.dot === true,
    nodir: options.onlyFiles !== false,
    follow: options.followSymbolicLinks !== false,
    ignore: [...(Array.isArray(options.ignore) ? options.ignore : options.ignore ? [options.ignore] : []), ...excluded],
  });
};
