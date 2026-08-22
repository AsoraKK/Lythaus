import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .map((value) => value.replaceAll('\\', '/'));

const failures = [];
const forbiddenPrefixes = [
  '.codex-remote-attachments/',
  '.dead_code_backup/',
  'functions/',
  'temp/',
  'tmp/',
];

for (const file of tracked) {
  if (forbiddenPrefixes.some((prefix) => file.startsWith(prefix))) {
    failures.push(`${file}: forbidden active/repository-temporary path`);
  }
  if (/^\.github\/workflows\/.*-once\.ya?ml$/i.test(file)) {
    failures.push(`${file}: one-off workflow must be removed after use; preserve evidence under docs/history instead`);
  }
  if (/^\.github\/workflows\/ops-release-.*\.ya?ml$/i.test(file)) {
    failures.push(`${file}: release-specific workflow must not remain executable`);
  }
  if (/\.(?:bak|backup)$/i.test(file)) {
    failures.push(`${file}: backup artifact must not be tracked`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${tracked.length} tracked files contain no prohibited temporary paths or one-off workflows.`);
}
