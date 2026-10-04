import { closeSync, constants, fstatSync, ftruncateSync, lstatSync, openSync, readFileSync, realpathSync, writeSync } from 'node:fs';
import { relative, resolve, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function normalizeLevelAuthorityBuilderAssignment(source) {
  const marker = "case r'levelAuthority':";
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('monthly_report_level_authority_case_missing');

  const nextCase = source.indexOf("\n        case r'", start + marker.length);
  const defaultCase = source.indexOf('\n        default:', start + marker.length);
  const endings = [nextCase, defaultCase].filter((index) => index >= 0);
  const end = endings.length > 0 ? Math.min(...endings) : source.length;
  const block = source.slice(start, end);
  const directAssignments = block.match(/result\.levelAuthority\s*=\s*valueDes\s*;/gu) ?? [];
  const builderReplacements = block.match(/result\.levelAuthority\.replace\(valueDes\)\s*;/gu) ?? [];

  if (directAssignments.length === 1 && builderReplacements.length === 0) {
    return source.slice(0, start)
      + block.replace(/result\.levelAuthority\s*=\s*valueDes\s*;/u, 'result.levelAuthority.replace(valueDes);')
      + source.slice(end);
  }
  if (directAssignments.length === 0 && builderReplacements.length === 1) return source;
  throw new Error('monthly_report_level_authority_generator_shape_unexpected');
}

function main() {
  const generatedRoot = resolve(process.argv[2] ?? 'lib/generated/api_client');
  const repositoryRoot = realpathSync(process.cwd());
  const resolvedGeneratedRoot = realpathSync(generatedRoot);
  if (relative(repositoryRoot, resolvedGeneratedRoot).startsWith(`..${sep}`)
      || relative(repositoryRoot, resolvedGeneratedRoot) === '..') {
    throw new Error('generated_dart_client_path_outside_repository');
  }
  const target = join(generatedRoot, 'lib/src/model/monthly_reputation_report_response.dart');
  const resolvedTarget = realpathSync(target);
  if (!resolvedTarget.startsWith(`${resolvedGeneratedRoot}${sep}`)) {
    throw new Error('generated_dart_model_path_outside_client');
  }
  if (constants.O_NOFOLLOW === undefined) throw new Error('no_follow_file_open_unavailable');
  if (lstatSync(target).isSymbolicLink()) throw new Error('generated_dart_model_symlink_rejected');
  const descriptor = openSync(target, constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!fstatSync(descriptor).isFile()) throw new Error('regular_generated_dart_model_required');
    const before = readFileSync(descriptor, 'utf8');
    const after = normalizeLevelAuthorityBuilderAssignment(before);
    if (after !== before) {
      const bytes = Buffer.from(after, 'utf8');
      let offset = 0;
      while (offset < bytes.length) {
        const count = writeSync(descriptor, bytes, offset, bytes.length - offset, offset);
        if (count === 0) throw new Error('generated_dart_model_write_incomplete');
        offset += count;
      }
      ftruncateSync(descriptor, bytes.length);
    }
  } finally {
    closeSync(descriptor);
  }
  console.log(`Normalized monthly report built-value deserialization in ${target}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
