// Isolation guard: the FIRST import of every test file (`import './guard.mjs';`), so it runs in
// each test process; repo.test.mjs refuses a test file that does not start with it. (Not
// `node --import`: that would also load into the runner's parent, whose child_process it denies.)
//
// The scar this answers: a test stubs the obvious door (the `fetch` it passes in) and the code
// under test dials through a second one, and the suite stays green while talking to a live
// Karakeep. So every outward door is shut here — fetch, DNS, sockets (loopback included: a refused
// loopback connect is exactly the error path a test could pass on by accident), http(s), child
// processes — and each attempt is RECORDED as well as thrown.
//
// ⚠ JavaScript has no BaseException: `catch (e)` catches everything, and karakeep.js wraps fetch
// in exactly such a catch. A throw alone would be swallowed and the test would pass with the dial
// made. The record is what cannot be swallowed: on exit, any recorded attempt fails the run.
import child_process from 'node:child_process';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';

const attempts = [];
globalThis.__kxIsolationAttempts = attempts;

function deny(door) {
  return function denied(...args) {
    const what = typeof args[0] === 'string' ? args[0] : args[0] && (args[0].href || args[0].host || args[0].path || args[0].url);
    attempts.push(`${door}(${what ?? ''})`);
    throw new Error(`isolation guard: test attempted ${door}(${what ?? ''}) — stub it; tests never leave the process`);
  };
}

globalThis.fetch = deny('fetch');
dns.lookup = deny('dns.lookup');
dns.resolve = deny('dns.resolve');
dns.promises.lookup = deny('dns.promises.lookup');
dns.promises.resolve = deny('dns.promises.resolve');
net.Socket.prototype.connect = deny('net.Socket.connect');
net.connect = net.createConnection = deny('net.connect');
tls.connect = deny('tls.connect');
http.request = http.get = deny('http.request');
https.request = https.get = deny('https.request');
for (const fn of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  child_process[fn] = deny(`child_process.${fn}`);
}
syncBuiltinESMExports();

process.on('exit', (code) => {
  if (attempts.length) {
    process.stderr.write(`\nisolation guard: ${attempts.length} outward attempt(s), failing the run:\n  ${attempts.join('\n  ')}\n`);
    process.exitCode = 1;
    if (code === 0) process.exit(1);
  }
});
