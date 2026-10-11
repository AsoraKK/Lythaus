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
  assert.equal(target.hostname, '127.0.0.1');
  assert.ok(['drop_committed_response', 'drop_before_commit'].includes(mode));
  const sockets = new Set();
  let commitSeen = false, commandObserved, responseDropped = false;
  const server = net.createServer(front => {
    const back = net.connect({ host: '127.0.0.1', port: Number(target.port || 5432) });
    sockets.add(front); sockets.add(back);
    for (const socket of [front, back]) {
      socket.on('error', () => { front.destroy(); back.destroy(); });
      socket.on('close', () => sockets.delete(socket));
    }
    const requestFrames = frames(true, (kind, body) => {
      if (kind === 'Q' && body.toString('utf8') === 'COMMIT\0') commitSeen = true;
    });
    const responseFrames = frames(false, (kind, body) => {
      if (!commitSeen) return;
      if (kind === 'C') commandObserved = body.toString('utf8').replace(/\0$/, '');
      if (kind === 'Z') { responseDropped = true; front.destroy(); back.destroy(); }
    });
    front.on('data', data => {
      requestFrames(data);
      if (commitSeen && mode === 'drop_before_commit') {
        responseDropped = true; front.destroy(); back.destroy(); return;
      }
      back.write(data);
    });
    back.on('data', data => {
      if (commitSeen) responseFrames(data);
      else front.write(data);
    });
    front.on('end', () => back.end()); back.on('end', () => front.end());
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    port: server.address().port,
    get commitSeen() { return commitSeen; },
    get commandObserved() { return commandObserved; },
    get responseDropped() { return responseDropped; },
    async close() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); },
  };
}
