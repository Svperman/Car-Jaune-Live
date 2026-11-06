// Car Jaune Live — test : voyageurs anonymes (avec leur accord) visibles sur la carte des autres
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const store = [];                                     // faux ntfy partagé entre les deux téléphones
const b = await chromium.launch();
async function phone(){
  const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
  await ctx.route('https://ntfy.sh/**', async r => {
    const req = r.request(), h = { 'Access-Control-Allow-Origin':'*' };
    if (req.method() === 'POST'){ const o = JSON.parse(req.postData()); store.push({ id: 'm' + store.length, time: Math.floor(Date.now() / 1000), event:'message', topic: o.topic, message: o.message }); return r.fulfill({ status:200, headers:h, body:'{}' }); }
    const topic = new URL(req.url()).pathname.split('/')[1];
    r.fulfill({ status:200, headers:h, body: store.filter(m => m.topic === topic).map(m => JSON.stringify(m)).join('\n') });
  });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(BASE + '/_test.html'); await p.waitForTimeout(2500);
  await p.evaluate("document.querySelector('#geoSheet').hidden = true; forceUntil = Date.now() + 3600e3; updateMode(); refresh(); 1"); await p.waitForTimeout(1200);
  return p;
}
const A = await phone(), B = await phone();
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };
await t('sans accord : rien n’est envoyé, même dans un car', async () => {
  await A.evaluate("shareCfg.crowd = false; onBus = vehicles[0].id; myPos = { lat: vehicles[0].lat, lon: vehicles[0].lon, acc: 10, speed: 12 }; myFixAt = Date.now(); crowd.sentOff = true; crowdTick(); 1");
  await A.waitForTimeout(300);
  return store.length === 0 || store.length + ' message(s) envoyé(s)';
});
await t('avec accord, dans un car : point anonyme envoyé (sans nom)', async () => {
  await A.evaluate("shareCfg.name = 'Samuel'; shareCfg.crowd = true; crowd.last = 0; crowdTick(); 1");
  await A.waitForTimeout(300);
  const m = store[store.length - 1]; const o = m && JSON.parse(m.message);
  return (o && o.k === 'cjv1' && o.l && !/Samuel/.test(m.message)) || JSON.stringify(m);
});
await t('l’autre téléphone voit le voyageur bouger sur sa carte', async () => {
  await B.evaluate("crowd.at = 0; crowdPoll()"); await B.waitForTimeout(500);
  const r1 = await B.evaluate("[Object.keys(crowd.mk).length, document.querySelector('.cw-mk') && document.querySelector('.cw-mk').innerText]");
  await A.evaluate("myPos = { lat: myPos.lat + 0.002, lon: myPos.lon + 0.002, acc: 10, speed: 12 }; myFixAt = Date.now(); crowd.last = 0; crowdTick(); 1");
  await A.waitForTimeout(300);
  await B.evaluate("crowd.at = 0; crowdPoll()"); await B.waitForTimeout(1500);
  const r2 = await B.evaluate("(() => { const id = Object.keys(crowd.mk)[0]; const ll = crowd.mk[id].getLatLng(); return [ll.lat, crowd.people[id].lat]; })()");
  return (r1[0] === 1 && Math.abs(r2[0] - r2[1]) < 1e-6) || JSON.stringify([r1, r2]);
});
await t('je ne me vois pas moi-même en double', async () => {
  await A.evaluate("crowd.at = 0; crowdPoll()"); await A.waitForTimeout(400);
  return (await A.evaluate("Object.keys(crowd.mk).length")) === 0 || 'je me vois';
});
await t('descendu du car : le point disparaît chez les autres', async () => {
  await A.evaluate("onBus = null; crowdTick(); 1"); await A.waitForTimeout(300);
  await B.evaluate("crowd.at = 0; crowdPoll()"); await B.waitForTimeout(400);
  return (await B.evaluate("Object.keys(crowd.mk).length")) === 0 || 'toujours affiché';
});
await t('« Voir les autres voyageurs » coupé : aucun point', async () => {
  await A.evaluate("onBus = vehicles[0].id; myFixAt = Date.now(); crowd.last = 0; crowdTick(); 1"); await A.waitForTimeout(300);
  await B.evaluate("shareCfg.crowdView = false; crowd.at = 0; crowdPoll(); crowdDraw(); 1"); await B.waitForTimeout(300);
  return (await B.evaluate("Object.keys(crowd.mk).length")) === 0 || 'points affichés';
});
[...A.errs, ...B.errs].forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Voyageurs anonymes : tout est bon.');
