import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const labelKey = 'co.lythaus.sdk-verifier-run';
const idPattern = /^[a-f0-9]{64}$/;
const cleanupMilliseconds = 30000;

export class SdkInterruption {
  constructor() {
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.handlers = new Map(['SIGINT', 'SIGTERM'].map(name => [name, () => {
      if (this.received) return;
      this.received = name;
      const error = new Error(`SDK_VERIFICATION_INTERRUPTED:${name}`);
      error.exitCode = name === 'SIGINT' ? 130 : 143;
      error.cleanupDeadline = Date.now() + cleanupMilliseconds;
      this.controller.abort(error);
    }]));
    for (const [name, handler] of this.handlers) process.on(name, handler);
  }
  dispose() { for (const [name, handler] of this.handlers) process.removeListener(name, handler); }
}

export async function dockerCommand(args, { env, signal, timeout = 600000, maxBuffer = 16 * 1024 * 1024 } = {}) {
  signal?.throwIfAborted();
  return await new Promise((resolve, reject) => {
    const child = spawn('docker', args, { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', bytes = 0, failure, closed, escalation, stopping = false;
    const kill = name => {
      if (!child.pid) return;
      try { process.kill(-child.pid, name); } catch (error) { if (error.code !== 'ESRCH') failure ??= error; }
    };
    const finish = () => {
      if (!closed || escalation) return;
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      if (signal?.aborted) reject(signal.reason);
      else if (failure) reject(failure);
      else resolve(closed);
    };
    const stop = () => {
      if (stopping) return;
      stopping = true; kill('SIGTERM');
      escalation = setTimeout(() => { kill('SIGKILL'); escalation = undefined; finish(); }, 1000);
    };
    const timer = setTimeout(() => { failure ??= new Error('ISOLATION_EXECUTION_TIMEOUT'); stop(); }, timeout);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    const capture = (stream, data) => {
      bytes += data.length;
      if (bytes > maxBuffer) { failure ??= new Error('ISOLATION_OUTPUT_LIMIT'); stop(); return; }
      if (stream === 'stdout') stdout += data.toString(); else stderr += data.toString();
    };
    child.stdout.on('data', data => capture('stdout', data));
    child.stderr.on('data', data => capture('stderr', data));
    child.on('error', error => { failure ??= error; });
    child.on('close', (status, childSignal) => { closed = { status, signal: childSignal, stdout, stderr }; finish(); });
  });
}

export class SdkContainers {
  constructor(directory, { signal, execute = dockerCommand, env = process.env } = {}) {
    this.directory = directory; this.signal = signal; this.execute = execute;
    this.runId = randomUUID(); this.records = []; this.creations = [];
    this.env = { PATH: '/usr/local/bin:/usr/bin:/bin', DOCKER_CONFIG: join(directory, `docker-config-${this.runId}`) };
    if (env.DOCKER_HOST) {
      if (!/^unix:\/\/\/[a-zA-Z0-9_./-]+$/.test(env.DOCKER_HOST)) throw new Error('LOCAL_DOCKER_DAEMON_REQUIRED');
      this.env.DOCKER_HOST = env.DOCKER_HOST;
    }
    fs.mkdirSync(this.env.DOCKER_CONFIG, { recursive: true, mode: 0o700 });
    this.save();
  }
  save() {
    fs.writeFileSync(join(this.directory, `containers-${this.runId}.json`), JSON.stringify({ runId: this.runId, containers: this.records, creations: this.creations }, null, 2) + '\n');
  }
  recover() {
    for (const creation of this.creations) {
      const file = join(this.directory, creation.cidfile);
      const stat = fs.lstatSync(file, { throwIfNoEntry: false });
      if (!stat) continue;
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 128) throw new Error('OWNED_CONTAINER_CIDFILE_INVALID');
      const id = fs.readFileSync(file, 'utf8').trim();
      if (!idPattern.test(id)) throw new Error('OWNED_CONTAINER_ID_INVALID');
      const previous = this.records.find(record => record.cidfile === creation.cidfile);
      if (previous && previous.id !== id) throw new Error('OWNED_CONTAINER_ID_MISMATCH');
      if (!previous) this.records.push({ id, cidfile: creation.cidfile, state: 'created' });
    }
    this.save();
  }
  async docker(args, options = {}) { return await this.execute(args, { env: this.env, signal: this.signal, ...options }); }
  async run(args) {
    this.signal?.throwIfAborted();
    if (args[0] !== 'run' || args.includes('--cidfile') || args.includes('--label')) throw new Error('OWNED_CONTAINER_ARGUMENTS_REQUIRED');
    const cidfile = `sdk-${this.runId}-${this.creations.length}.cid`;
    const name = `lythaus-sdk-${this.runId}-${this.creations.length}`;
    const create = ['create', '--cidfile', join(this.directory, cidfile), '--label', `${labelKey}=${this.runId}`, ...args.slice(1)];
    const nameIndex = create.indexOf('--name');
    if (nameIndex !== -1) create[nameIndex + 1] = name;
    else create.splice(1, 0, '--name', name);
    this.creations.push({ cidfile, name, state: 'requested' }); this.save();
    try {
      let result;
      try { result = await this.docker(create); } finally { this.recover(); }
      if (result.status !== 0) throw new Error(`ISOLATION_CREATE_FAILED:${result.status}:${result.stderr.slice(-1000)}`);
      const record = this.records.find(record => record.cidfile === cidfile);
      if (!record) throw new Error('OWNED_CONTAINER_ID_REQUIRED');
      return await this.docker(['start', '--attach', record.id]);
    } finally { await this.removeAll(); }
  }
  async inspect(id, options) {
    if (!idPattern.test(id)) throw new Error('OWNED_CONTAINER_ID_INVALID');
    const result = await this.docker(['container', 'inspect', id], options);
    if (result.status !== 0 && /No such (?:container|object)/i.test(result.stderr)) return null;
    if (result.status !== 0) throw new Error('OWNED_CONTAINER_INSPECTION_FAILED');
    const value = JSON.parse(result.stdout);
    if (value.length !== 1 || value[0].Id !== id) throw new Error('OWNED_CONTAINER_INSPECTION_MISMATCH');
    return value[0];
  }
  async recoverOwnedNames(options) {
    for (const [index, creation] of this.creations.entries()) {
      if (this.records.some(record => record.cidfile === creation.cidfile)) continue;
      if (creation.name !== `lythaus-sdk-${this.runId}-${index}`) throw new Error('OWNED_CREATION_NAME_INVALID');
      const result = await this.docker(['container', 'inspect', creation.name], options());
      if (result.status !== 0 && /No such (?:container|object)/i.test(result.stderr)) { creation.state = 'absent'; this.save(); continue; }
      if (result.status !== 0) throw new Error('OWNED_CREATION_INSPECTION_FAILED');
      const containers = JSON.parse(result.stdout), container = containers[0];
      if (containers.length !== 1 || !idPattern.test(container?.Id ?? '') || container.Name !== `/${creation.name}` || container.Config?.Labels?.[labelKey] !== this.runId) throw new Error('OWNED_CREATION_LABEL_MISMATCH');
      this.records.push({ id: container.Id, cidfile: creation.cidfile, name: creation.name, recoveredFrom: 'owned-name', state: 'created' });
      creation.state = 'recovered'; this.save();
    }
  }
  async removeAll() {
    const deadline = this.signal?.reason?.cleanupDeadline ?? Date.now() + cleanupMilliseconds;
    this.recover();
    const failures = [];
    const options = () => {
      if (Date.now() >= deadline) throw new Error('OWNED_CONTAINER_CLEANUP_DEADLINE');
      return { signal: null, timeout: Math.min(5000, deadline - Date.now()) };
    };
    try { await this.recoverOwnedNames(options); }
    catch (error) { failures.push(error); }
    for (const record of [...this.records].reverse().filter(record => record.state !== 'removed')) {
      try {
        const container = await this.inspect(record.id, options());
        if (container && container.Config.Labels?.[labelKey] !== this.runId) throw new Error('OWNED_CONTAINER_LABEL_MISMATCH');
        if (container && (await this.docker(['rm', '--force', '--volumes', record.id], options())).status !== 0) throw new Error('OWNED_CONTAINER_REMOVAL_FAILED');
        if (await this.inspect(record.id, options()) !== null) throw new Error('OWNED_CONTAINER_STILL_PRESENT');
        record.state = 'removed'; delete record.error;
      } catch (error) { record.state = 'cleanup_failed'; record.error = error.message; failures.push(error); }
      this.save();
    }
    if (this.creations.some(creation => creation.state !== 'absent' && !this.records.some(record => record.cidfile === creation.cidfile))) failures.push(new Error('OWNED_CONTAINER_CREATION_UNRECORDED'));
    if (failures.length) throw new AggregateError(failures, 'OWNED_CONTAINER_CLEANUP_FAILED');
  }
}

export async function withOwnedContainers(directory, work) {
  const interruption = new SdkInterruption();
  let failure, owner;
  try {
    owner = new SdkContainers(directory, { signal: interruption.signal });
    const result = await work(owner);
    interruption.signal.throwIfAborted();
    return result;
  } catch (error) {
    failure = interruption.signal.reason ?? error;
    if (failure !== error) failure.cleanupError = error.message;
    throw failure;
  }
  finally {
    try { await owner?.removeAll(); }
    catch (error) {
      if (interruption.signal.aborted || failure) {
        (interruption.signal.reason ?? failure).cleanupError = error.message;
        process.stderr.write(`Container cleanup failed: ${error.message}\n`);
      } else throw error;
    } finally { interruption.dispose(); }
  }
}
