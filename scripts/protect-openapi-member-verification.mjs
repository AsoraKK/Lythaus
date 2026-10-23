import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const marker = '  Future<Response<MemberActionVerificationReceipt>> verifyRecentAccountAction({';
const webGuard = `    if (const bool.fromEnvironment('dart.library.js_interop') ||
        const bool.fromEnvironment('dart.library.html')) {
      throw UnsupportedError('Use the redirect-rejecting browser verification client');
    }
`;
const safeStatus = `      followRedirects: false,
      maxRedirects: 0,
      validateStatus: (status) => status != null && status >= 200 && status < 300 &&
          (validateStatus?.call(status) ?? true),`;

export function protectMemberVerification(source) {
  const start = source.indexOf(marker);
  const bodyStart = source.indexOf('  }) async {', start);
  const closing = source.indexOf('\n  }', bodyStart + '  }) async {'.length);
  const end = closing + '\n  }'.length;
  if (start < 0 || bodyStart < start || closing < bodyStart || source.indexOf(marker, start + marker.length) >= 0) {
    throw new Error('member_verification_generator_method_shape_changed');
  }
  const before = source.slice(start, end);
  const anchor = "    final _path = r'/auth/recent-verification';";
  if (!before.includes(anchor)) throw new Error('member_verification_generator_path_changed');
  let after = before;
  if (!after.includes(webGuard)) after = after.replace(anchor, webGuard + anchor);
  if (!after.includes(safeStatus)) {
    if (after.split('      validateStatus: validateStatus,').length !== 2) {
      throw new Error('member_verification_generator_options_changed');
    }
    after = after.replace('      validateStatus: validateStatus,', safeStatus);
  }
  return source.slice(0, start) + after + source.slice(end);
}

function main() {
  const root = realpathSync(process.argv[2] ?? 'lib/generated/api_client');
  const target = realpathSync(join(root, 'lib/src/api/auth_api.dart'));
  for (const [parent, child] of [[realpathSync(process.cwd()), root], [root, target]]) {
    const path = relative(parent, child);
    if (path === '..' || path.startsWith(`..${sep}`) || resolve(parent, path) !== child) {
      throw new Error('member_verification_generated_path_outside_repository');
    }
  }
  const before = readFileSync(target, 'utf8');
  const after = protectMemberVerification(before);
  if (after !== before) writeFileSync(target, after);
  console.log('Protected the generated member verification transport.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
