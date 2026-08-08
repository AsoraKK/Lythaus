import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'lib/generated/api_client');
const apiFile = path.join(root, 'lib', 'src', 'api.dart');
const exportFile = path.join(root, 'lib', 'lythaus_api_client.dart');
const interceptorFile = path.join(root, 'lib', 'src', 'auth', 'oauth.dart');
const manifestFile = path.join(root, '.openapi-generator', 'FILES');

let changes = 0;

function rewrite(file, transform) {
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changes += 1;
  }
}

rewrite(apiFile, (source) => source
  .replace("import 'package:lythaus_api_client/src/auth/oauth.dart';\n", '')
  .replace('        OAuthInterceptor(),\n', '')
  .replace(/\n  void setOAuthToken\(String name, String token\) \{[\s\S]*?\n  \}\n/, '\n'));

rewrite(exportFile, (source) => source.replace("export 'package:lythaus_api_client/src/auth/oauth.dart';\n", ''));
rewrite(manifestFile, (source) => source.replace(/lib\/src\/auth\/oauth\.dart\r?\n/, ''));

if (fs.existsSync(interceptorFile)) {
  fs.rmSync(interceptorFile);
  changes += 1;
}
if (changes === 0) throw new Error(`Expected generated OAuth support was not found under ${root}`);
console.log(`Removed unused generated OAuth support from ${path.relative(process.cwd(), root)}.`);
