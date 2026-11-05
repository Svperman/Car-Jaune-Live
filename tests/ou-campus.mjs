// Car Jaune Live — test : route + ville de chaque car, et retrait de l'arrêt « Campus »
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
await ctx.addInitScript(() => {
  if (!sessionStorage.getItem('init')){ sessionStorage.setItem('init', '1');
    localStorage.setItem('cj_trip', JSON.stringify({ a:'Campus', b:'Gare de St-Paul', mode:'auto' }));
    localStorage.setItem('cj_stop', 'Campus'); localStorage.removeItem('cj_mig_campus'); localStorage.removeItem('cj_ign'); }
});
// pas d'accès aux services en test : faux contours de commune et fausse route
await ctx.route(/geo\.api\.gouv\.fr\/communes\?codeDepartement/, r => r.fulfill({ status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'},
  body: JSON.stringify([{ nom:'Sainte-Marie', contour:{ type:'Polygon', coordinates:[[[55.50,-20.95],[55.60,-20.95],[55.60,-20.85],[55.50,-20.85],[55.50,-20.95]]] } }]) }));
await ctx.route(/overpass/, r => r.fulfill({ status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'},
  body: JSON.stringify({ elements:[{ type:'way', tags:{ highway:'trunk', ref:'N 2', name:'Boulevard Sud' }, geometry:[{ lat:-20.9001, lon:55.52 }, { lat:-20.9001, lon:55.56 }] }] }) }));
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/_test.html'); await p.waitForTimeout(5000);
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };
await t('Campus retiré du trajet et de l’arrêt choisi', async () => {
  const r = await p.evaluate("[trip.a, localStorage.getItem('cj_stop'), JSON.parse(localStorage.getItem('cj_ign') || '[]').join()]");
  return (r[0] === '' && r[1] !== 'Campus' && /Campus/.test(r[2])) || JSON.stringify(r);
});
await t('Campus n’est plus jamais choisi automatiquement', async () => {
  const r = await p.evaluate("(() => { stopGroups.push({ name:'Campus', key:'campus', ids:['zz'], lat:-20.90, lon:55.53 }); return nearbyStops(-20.90, 55.53, 3).map(x => x.g.name); })()");
  return !r.includes('Campus') || JSON.stringify(r);
});
await t('car sur une route : « RN2 (Boulevard Sud) · Sainte-Marie »', async () => {
  await p.evaluate('whereLoad()'); await p.waitForTimeout(800);
  const r = await p.evaluate("(() => { const v = Object.assign({}, vehicles[0], { id:'w1', lat:-20.9003, lon:55.53 }); return [whereText(v), whereText(v, true)]; })()");
  return (r[0] === 'RN2 · Sainte-Marie' && r[1] === 'RN2 (Boulevard Sud) · Sainte-Marie') || JSON.stringify(r);
});
await t('hors des grandes routes : arrêt le plus proche + ville', async () => {
  const r = await p.evaluate("whereText(Object.assign({}, vehicles[0], { id:'w2', lat:-20.88, lon:55.59, stopName:'Duparc' }), true)");
  return r === 'près de Duparc · Sainte-Marie' || r;
});
await t('affiché dans la liste des cars', async () => {
  await p.evaluate("forceUntil = Date.now() + 3600e3; updateMode(); refresh(); 1"); await p.waitForTimeout(1500);
  const r = await p.evaluate("document.querySelectorAll('#list .where').length");
  return r >= 1 || 'aucune ligne « 📍 »';
});
errs.forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Route, ville et Campus : tout est bon.');
