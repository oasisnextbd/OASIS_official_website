// End-to-end: real firmware (bench) <-> local broker <-> real dashboard app in Chromium.
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const OUT = process.argv[2] || "out";
const ctl = (k, v) => new Promise(r => http.get(`http://localhost:8899/ctl?k=${k}&v=${v}`, res => { res.resume(); res.on('end', r); }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') => { results.push([ok ? 'PASS' : 'FAIL', name, info]); console.log(ok ? 'PASS' : 'FAIL', name, info); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.route('https://cdn.jsdelivr.net/npm/mqtt@4.3.7/dist/mqtt.min.js', r => r.fulfill({ path: path.join(__dirname, 'node_modules/mqtt/dist/mqtt.min.js'), contentType: 'application/javascript' }));
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|favicon/.test(m.text())) errs.push(m.text()); });
  let pin = 'bench-pin-4821';
  p.on('dialog', d => d.type() === 'prompt' ? d.accept(pin) : d.accept());
  await p.goto('http://localhost:8766/index.html?broker=ws://localhost:8888/mqtt');

  // 1. live data arrives (the dryer may need up to 60 s to reconnect after the prefill)
  await p.waitForFunction(() => document.getElementById('pillTxt').textContent === 'Live', null, { timeout: 90000 });
  check('pill shows Live', true);
  await p.waitForFunction(() => H.t.length > 100, null, { timeout: 20000 }).catch(() => {});
  const h = await p.evaluate(() => ({ n: H.t.length, first: H.t[0], last: H.t[H.t.length - 1], live: liveStart }));
  check('history from the dryer fills the charts', h.n > 100 && h.first < 300, JSON.stringify(h));
  const st = await p.evaluate(() => ({ water: $('wrem').textContent, upd: $('upd').textContent, dw: $('dw').textContent, start: $('bStart').textContent }));
  check('water comes from the dryer', /g/.test(st.water) && st.water !== '0 g', st.water);
  check('updated line shown', /Updated/.test(st.upd), st.upd);
  await p.screenshot({ path: OUT + '/e2e-home.png' });
  await p.click('[data-v=charts]'); await sleep(400);
  await p.screenshot({ path: OUT + '/e2e-charts.png', fullPage: true });
  await p.click('[data-v=about]'); await sleep(300);
  const diag = await p.evaluate(() => !$('diag').hidden && $('diagList').textContent);
  check('dryer status card', !!diag && /1\.1\.0/.test(diag), diag);
  await p.click('[data-v=home]');

  // 2. signed command with the right PIN
  await p.click('[data-m=on]');
  await p.waitForFunction(() => /confirmed/.test($('ctlMsg').textContent), null, { timeout: 15000 }).catch(() => {});
  check('fan On accepted', /confirmed/.test(await p.textContent('#ctlMsg')), await p.textContent('#ctlMsg'));
  await p.waitForFunction(() => last && last.ctrl === 1, null, { timeout: 8000 }).catch(() => {});
  check('state shows manual on', await p.evaluate(() => last.ctrl === 1 && last.fan === 1));

  // 3. wrong PIN
  await p.evaluate(() => sessionStorage.removeItem('rb_pin')); pin = '1111';
  await p.click('[data-m=auto]');
  await p.waitForFunction(() => /Wrong PIN/.test($('ctlMsg').textContent), null, { timeout: 10000 }).catch(() => {});
  check('wrong PIN reported at once', /Wrong PIN/.test(await p.textContent('#ctlMsg')), await p.textContent('#ctlMsg'));
  check('wrong PIN forgotten', await p.evaluate(() => !sessionStorage.getItem('rb_pin')));
  pin = 'bench-pin-4821';
  await p.click('[data-m=auto]');
  await p.waitForFunction(() => /confirmed/.test($('ctlMsg').textContent), null, { timeout: 10000 }).catch(() => {});
  check('right PIN after wrong one works', /confirmed/.test(await p.textContent('#ctlMsg')));

  // 4. stale nonce: another viewer changes the nonce, our retry uses the fresh one
  await p.evaluate(() => { last.nonce = '00000001'; });
  await p.click('[data-m=off]');
  await p.waitForFunction(() => /confirmed/.test($('ctlMsg').textContent) && last.ctrl === 2, null, { timeout: 10000 }).catch(() => {});
  check('stale nonce retried automatically', await p.evaluate(() => last.ctrl === 2), await p.textContent('#ctlMsg'));
  await p.click('[data-m=auto]'); await sleep(1500);

  // 5. new batch
  await p.click('[data-v=batch]');
  await p.click('#reset');
  await p.waitForFunction(() => /New batch/.test($('batchMsg').textContent), null, { timeout: 10000 }).catch(() => {});
  check('new batch confirmed', /New batch/.test(await p.textContent('#batchMsg')));
  check('charts restart with the batch', await p.evaluate(() => H.t.length < 5 && last.sess < 20), JSON.stringify(await p.evaluate(() => [H.t.length, last.sess])));
  await p.click('[data-v=home]');

  // 6. outside sensor fails -> set values, labelled
  await ctl('fail_out', 1); await sleep(10000);
  check('outside set-value label', await p.evaluate(() => !$('outNote').hidden && /set value/.test($('outH').textContent)));
  await ctl('fail_out', 0);

  // 7. inside sensor fails -> fault, no stale inside numbers, outside still live
  await ctl('fail_in', 1); await sleep(10000);
  const f = await p.evaluate(() => ({ h: $('headline').textContent, tin: $('tin').textContent, tout: $('tout').textContent, fan: last.fan }));
  check('inside fault shown, fan on', /sensor/i.test(f.h) && f.tin === '--' && f.tout !== '--' && f.fan === 1, JSON.stringify(f));
  await p.screenshot({ path: OUT + '/e2e-fault.png' });
  await ctl('fail_in', 0); await sleep(9000);
  check('recovers after fault', await p.evaluate(() => !last.fault && last.tin != null));

  // 8. overheat latch: on above 65, stays on until below 62
  await ctl('hot', 1);
  await p.waitForFunction(() => last && last.mode === 'HOT', null, { timeout: 60000 }).catch(() => {});
  check('overheat protection', await p.evaluate(() => last.mode === 'HOT' && last.fan === 1), await p.evaluate(() => last.tin));
  await p.screenshot({ path: OUT + '/e2e-hot.png' });
  await ctl('hot', 0);
  await p.waitForFunction(() => last && last.tin < 64.5, null, { timeout: 60000 }).catch(() => {});
  check('still protecting between 62 and 65', await p.evaluate(() => last.tin >= 62 ? last.mode === 'HOT' : true), await p.evaluate(() => last.tin + ' ' + last.mode));

  // 9. dryer disappears -> last will -> offline
  await ctl('broker', 0);
  await p.waitForFunction(() => /offline/i.test($('pillTxt').textContent), null, { timeout: 15000 }).catch(() => {});
  check('dryer offline detected', /offline/i.test(await p.textContent('#pillTxt')), await p.textContent('#pillTxt'));
  await ctl('broker', 1);
  await p.waitForFunction(() => document.getElementById('pillTxt').textContent === 'Live', null, { timeout: 90000 }).catch(() => {});
  check('back to live after reconnect', (await p.textContent('#pillTxt')) === 'Live');

  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(results.filter(r => r[0] === 'FAIL').length + ' failed of ' + results.length);
})();
