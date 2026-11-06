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
errs.forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Carte lisible : tout est bon.');
