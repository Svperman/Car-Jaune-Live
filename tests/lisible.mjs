// Car Jaune Live — test : carte lisible (« Mes lignes » en couleur, les autres en gris, cars des autres lignes discrets)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{ width:390, height:844 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/_test.html'); await p.waitForTimeout(2500);
await p.evaluate("document.querySelector('#geoSheet').hidden = true; localStorage.removeItem('cj_focus'); forceUntil = Date.now() + 3600e3; updateMode(); refresh(); 1"); await p.waitForTimeout(1500);
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };
const lines = () => p.evaluate("shapeLayer.getLayers().map(l => l.options.color + '/' + l.options.weight)");
await t('sans trajet : lignes fines, dans leur couleur, pas de bandeau', async () => {
  await p.evaluate("trip.a = ''; trip.b = ''; tfTripCache = { key:'', lines:[] }; selected.clear(); drawShapes(true); 1");
  const l = await lines(), bar = await p.evaluate("document.querySelector('#focusBar').hidden");
  return (l.length && l.every(x => !x.startsWith('#222') && +x.split('/')[1] <= 4) && !l.some(x => x.startsWith('#8A94A0')) && bar) || JSON.stringify([l, bar]);
});
await t('avec mon trajet : E1 en couleur, les autres lignes en gris, bandeau « Mes lignes »', async () => {
  await p.evaluate("trip.a = 'Gare de St-Denis'; trip.b = 'Gare de St-Benoît'; tfTripCache = { key:'', lines:[] }; render(); 1"); await p.waitForTimeout(300);
  const l = await lines(), bar = await p.evaluate("document.querySelector('#focusBar').innerText");
  return (l.some(x => x.startsWith('#F6BE00/5')) && l.some(x => x.startsWith('#8A94A0')) && /Mes lignes/.test(bar) && /E1/.test(bar)) || JSON.stringify([l, bar]);
});
await t('car d’une autre ligne : affiché discret', async () => {
  const r = await p.evaluate(`(() => { const v = Object.assign({}, vehicles[0], { id:'autre', routeId:'9', route: S.routes['9'] }); vehicles.push(v); render(); const d = document.querySelectorAll('.bus-mk.dim').length; vehicles.pop(); render(); return d; })()`);
  return r === 1 || r + ' car(s) discret(s)';
});
await t('« Tout voir » : toutes les lignes en couleur', async () => {
  await p.click('#focusBar [data-focus="all"]'); await p.waitForTimeout(200);
  const l = await lines(); return !l.some(x => x.startsWith('#8A94A0')) || JSON.stringify(l);
});
await t('« Mes lignes » de nouveau, et retenu', async () => {
  await p.click('#focusBar [data-focus="mine"]'); await p.waitForTimeout(200);
  return (await p.evaluate("localStorage.getItem('cj_focus')")) === 'mine' || 'non retenu';
});
// 60 cars sur l'île : aucune étiquette ne doit en chevaucher une autre
await p.evaluate(`(() => {
  const base = vehicles[0], rts = [['E1','F6BE00','222222'],['O1','0072BC','FFFFFF'],['S4','7AB800','FFFFFF'],['ZO','9B59B6','FFFFFF'],['ZEN','E91E63','FFFFFF']];
  const path = [[-20.879,55.448],[-20.90,55.53],[-21.033,55.712],[-21.28,55.70],[-21.34,55.48],[-21.20,55.30],[-21.01,55.27],[-20.879,55.448]];
  const out = [];
  for (let i = 0; i < 60; i++){ const k = (i * 0.2334) % 1 * (path.length - 1), j = Math.floor(k), f = k - j, a = path[j], c = path[j + 1], r = rts[i % 5];
    out.push(Object.assign({}, base, { id:'v' + i, lat: a[0] + (c[0] - a[0]) * f, lon: a[1] + (c[1] - a[1]) * f, route:{ s:r[0], c:r[1], t:r[2] }, routeId:'x' + (i % 5), delay: (i % 4) * 150, age: 20e3 })); }
  window.__keep = vehicles; vehicles = out; refresh = async () => {}; onBus = 'v7'; trip.a = ''; trip.b = ''; tfTripCache = { key:'', lines:[] };
  map.setView([-21.1, 55.53], 9.75, { animate:false }); render();
})()`);
await p.waitForTimeout(400);
const over = () => p.evaluate(`(() => { const r = [...document.querySelectorAll('.bus-mk:not(.dot) .pill2')].map(e => e.getBoundingClientRect()); let n = 0;
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (!(r[i].right < r[j].left || r[i].left > r[j].right || r[i].bottom < r[j].top || r[i].top > r[j].bottom)) n++;
  return [r.length, document.querySelectorAll('.bus-mk.dot').length, n]; })()`);
await t('île entière, 60 cars : aucune étiquette ne se chevauche (les autres en points)', async () => {
  const r = await over(); return (r[2] === 0 && r[1] > 0 && r[0] > 5) || `étiquettes ${r[0]}, points ${r[1]}, chevauchements ${r[2]}`;
});
await t('le car où je suis garde toujours son étiquette', async () => (await p.evaluate("!busDots.has('v7')")) || 'mon car est un point');
await t('en zoomant : plus d’étiquettes, toujours sans chevauchement', async () => {
  const a = (await over())[0];
  await p.evaluate("map.setView([-20.95, 55.6], 12.5, { animate:false }); render(); 1"); await p.waitForTimeout(400);
  const r = await over(); const vis = await p.evaluate("document.querySelectorAll('.bus-mk').length");
  return (r[2] === 0 && r[0] / Math.max(1, vis) >= a / 60) || JSON.stringify([a, r, vis]);
});
errs.forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Carte lisible : tout est bon.');
