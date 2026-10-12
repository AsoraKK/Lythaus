import assert from 'node:assert/strict';
import dns from 'node:dns';
import net from 'node:net';

export const fixtureHost = 'transaction-fixture.hyperdrive.local';

export function localFixtureDns() {
  const original = dns.lookup;
  dns.lookup = (hostname, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    queueMicrotask(() => {
      if (![fixtureHost, '127.0.0.1'].includes(hostname)) return callback(new Error('transaction_fixture_outbound_denied'));
      if (options?.all) return callback(null, [{ address: '127.0.0.1', family: 4 }]);
      callback(null, '127.0.0.1', 4);
    });
  };
  return () => { dns.lookup = original; };
}

function frames(startup, receive) {
  let pending = Buffer.alloc(0);
  return data => {
    pending = Buffer.concat([pending, data]);
    while (pending.length >= (startup ? 4 : 5)) {
      const length = pending.readInt32BE(startup ? 0 : 1) + (startup ? 0 : 1);
      assert.ok(length >= 4 && length <= 1024 * 1024);
      if (pending.length < length) return;
      const frame = pending.subarray(0, length); pending = pending.subarray(length);
      if (startup) { startup = false; continue; }
      receive(String.fromCharCode(frame[0]), frame.subarray(5));
    }
  };
}

export async function commitResponseProxy(target, mode) {
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
  assert.ok(['drop_committed_response', 'drop_before_commit'].includes(mode));
  return responseProxy(target, {
    mode,
    matches(kind, body) { return kind === 'Q' && body.toString('utf8') === 'COMMIT\0'; },
  });
}

export async function statementResponseProxy(target, statementFragment, mode = 'drop_committed_response') {
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
  assert.ok(typeof statementFragment === 'string' && statementFragment.length >= 12);
  assert.ok(['drop_committed_response', 'drop_before_commit', 'stall_after_acknowledgement'].includes(mode));
  return responseProxy(target, {
    mode,
    matches(kind, body) {
      if (kind !== 'P') return false;
      const statementNameEnd = body.indexOf(0);
      const queryEnd = body.indexOf(0, statementNameEnd + 1);
      return statementNameEnd >= 0 && queryEnd > statementNameEnd
        && body.subarray(statementNameEnd + 1, queryEnd).toString('utf8').includes(statementFragment);
    },
  });
}

async function responseProxy(target, { mode, matches }) {
  const sockets = new Set();
  let commitSeen = false, commandObserved, responseDropped = false, acknowledged = false, terminationSeen = false;
  const server = net.createServer({ allowHalfOpen: mode === 'stall_after_acknowledgement' }, front => {
    const back = net.connect({ host: '127.0.0.1', port: Number(target.port || 5432) });
    sockets.add(front); sockets.add(back);
    for (const socket of [front, back]) {
      socket.on('error', () => { front.destroy(); back.destroy(); });
      socket.on('close', () => sockets.delete(socket));
    }
    const requestFrames = frames(true, (kind, body) => {
      if (matches(kind, body)) commitSeen = true;
      if (kind === 'X') terminationSeen = true;
    });
    const responseFrames = frames(false, (kind, body) => {
      if (!commitSeen) return;
      if (kind === 'C') commandObserved = body.toString('utf8').replace(/\0$/, '');
      if (kind === 'Z') {
        acknowledged = true;
        if (mode !== 'stall_after_acknowledgement') { responseDropped = true; front.destroy(); back.destroy(); }
      }
    });
    front.on('data', data => {
      requestFrames(data);
      if (commitSeen && mode === 'drop_before_commit') {
        responseDropped = true; front.destroy(); back.destroy(); return;
      }
      back.write(data);
    });
    back.on('data', data => {
      if (commitSeen) {
        responseFrames(data);
        if (mode === 'stall_after_acknowledgement') front.write(data);
      }
      else front.write(data);
    });
    front.on('end', () => back.end());
    back.on('end', () => { if (mode !== 'stall_after_acknowledgement' || !acknowledged) front.end(); });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    port: server.address().port,
    get commitSeen() { return commitSeen; },
    get commandObserved() { return commandObserved; },
    get responseDropped() { return responseDropped; },
    get acknowledged() { return acknowledged; },
    get terminationSeen() { return terminationSeen; },
    async close() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); },
  };
}
