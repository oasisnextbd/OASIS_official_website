// Local MQTT broker (TCP 1883 + WebSocket 8888/mqtt) and a bridge to the firmware bench.
// Usage: node bridge.js   (env PREFILL_MIN, SPEED passed to the bench)
// Control: an HTTP server on 8899: GET /ctl?k=fail_in&v=1  -> forwarded to the bench.
const aedes = require('aedes')();
const net = require('net');
const http = require('http');
const ws = require('websocket-stream');
const mqtt = require('mqtt');
const { spawn } = require('child_process');
const path = require('path');

const BASE = 'oasisnextbd/solar-dryer/x7k2';
net.createServer(aedes.handle).listen(1883);
const httpServer = http.createServer();
ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(8888);

const bench = spawn(path.join(__dirname, 'bench'), [], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
let dev = null, buf = '';
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
bench.stderr.on('data', d => process.stderr.write('[fw] ' + d));
bench.on('exit', c => { log('bench exited', c); if (dev) dev.publish(BASE + '/status', 'offline', { retain: true }); });

function devConnect() {
  dev = mqtt.connect('mqtt://localhost:1883', { clientId: 'dryer-bench', will: { topic: BASE + '/status', payload: 'offline', retain: true } });
  dev.on('connect', () => dev.subscribe([BASE + '/cmd', BASE + '/histreq']));
  dev.on('message', (t, m) => { log('->dryer', t, m.toString().slice(0, 90)); bench.stdin.write('MSG\t' + t + '\t' + m.toString('base64') + '\n'); });
}
devConnect();
bench.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    const p = line.split('\t');
    if (p[0] === 'CONN') { log('dryer connected to broker'); continue; }
    if (p[0] !== 'PUB') continue;
    const payload = Buffer.from(p[3], 'base64');
    if (!p[2].endsWith('/state')) log('dryer->', p[2], payload.toString().slice(0, 120), '(' + payload.length + ' B)');
    dev.publish(p[2], payload, { retain: p[1] === '1' });
  }
});
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/ctl') {
    const k = u.searchParams.get('k'), v = u.searchParams.get('v');
    if (k === 'broker' && v === '0') { dev.end(true); dev = null; }        // ungraceful: broker fires the last will
    if (k === 'broker' && v === '1' && !dev) devConnect();
    bench.stdin.write('CTL\t' + k + '\t' + v + '\n');
    res.end('ok');
  } else if (u.pathname === '/kill') { bench.kill('SIGKILL'); dev && dev.end(true); res.end('killed'); }
  else res.end('?');
}).listen(8899);
log('broker up: tcp 1883, ws 8888; control 8899');
