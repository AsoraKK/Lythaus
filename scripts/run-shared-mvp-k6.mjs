import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const docker = args[0] === '--docker';
const script = args[docker ? 1 : 0];
const baseUrl = process.env.K6_BASE_URL;

if (process.env.ALLOW_SHARED_MVP_LOAD_TESTS !== 'true') {
  console.error('Refusing load test: set ALLOW_SHARED_MVP_LOAD_TESTS=true after approval.');
  process.exit(2);
}

if (!baseUrl || !/^https:\/\/api\.lythaus\.co\/api(?:\/|$)/.test(baseUrl)) {
  console.error('Refusing load test: set K6_BASE_URL to the canonical https://api.lythaus.co/api endpoint.');
  process.exit(2);
}

if (!script) {
  console.error('Refusing load test: no k6 script was provided.');
  process.exit(2);
}

const command = docker ? 'docker' : 'k6';
const commandArgs = docker
  ? [
      'run',
      '--rm',
      '-i',
      '-e',
      `K6_BASE_URL=${baseUrl}`,
      '-e',
      'K6_SMOKE_TOKEN',
      '-v',
      `${process.cwd()}:/work`,
      '-w',
      '/work',
      'grafana/k6',
      'run',
      script,
    ]
  : ['run', script];

const result = spawnSync(command, commandArgs, {
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`Unable to start ${command}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
