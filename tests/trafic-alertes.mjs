// Car Jaune Live — test : alertes bouchons / accidents sur mon trajet et devant mon car
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
// faux TomTom : un accident sur la RN2 entre Duparc et St-Benoît (sur le tracé E1), un bouchon ailleurs (Tamarins)
let incidents = [];
await ctx.route(/api\.tomtom\.com\/traffic\/services\/5\/incidentDetails/, r => r.fulfill({ status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ incidents }) }));
await ctx.route(/api\.tomtom\.com\/(map|traffic\/map)/, r => r.abort());
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/_test.html'); await p.waitForTimeout(2500);
await p.evaluate("document.querySelector('#geoSheet').hidden = true; forceUntil = Date.now() + 3600e3; updateMode(); refresh(); 1"); await p.waitForTimeout(1200);
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };
const last = () => p.evaluate("(inbox[0] || {}).title || ''");
const mid = (a, b2, k) => [a[0] + (b2[0] - a[0]) * k, a[1] + (b2[1] - a[1]) * k];

await t('accident sur mon trajet (TomTom) → alerte', async () => {
  const c = mid([-20.90, 55.53], [-21.033, 55.712], .5);
  incidents = [{ type:'Feature', geometry:{ type:'LineString', coordinates:[[c[1] - .002, c[0] + .0015], [c[1], c[0]], [c[1] + .002, c[0] - .0015]] },
    properties:{ iconCategory:1, magnitudeOfDelay:3, events:[{ description:'Accident' }], from:'Sainte-Suzanne', to:'Saint-André', length:1200, delay:540, roadNumbers:['RN2'] } },
    { type:'Feature', geometry:{ type:'Point', coordinates:[55.30, -21.10] }, properties:{ iconCategory:6, magnitudeOfDelay:3, from:'Tamarins', to:'', delay:600, roadNumbers:['RN1'] } }];
  await p.evaluate("TF.key = 'cle-test'; TF.at = 0; trip.a = 'Gare de St-Denis'; trip.b = 'Gare de St-Benoît'; tfAlertLast = 0; Object.keys(alertSent).forEach(k => delete alertSent[k]); trafficAlertTick(true); 1");
  await p.waitForTimeout(800);
  await p.evaluate("trafficAlertTick(); 1");
  const r = await last(); console.log('    ', r, '·', await p.evaluate("(inbox[0] || {}).body"));
  return /Accident sur ton trajet/.test(r) || r;
});
await t('le même accident n’est pas signalé deux fois', async () => {
  await p.evaluate("tfAlertLast = 0; const n = inbox.length; trafficAlertTick(); window.__n = n; 1");
  return (await p.evaluate("inbox.length === window.__n")) || 'signalé de nouveau';
});
await t('bouchon hors de mon trajet (Tamarins) : pas d’alerte', async () => {
  return (await p.evaluate("!inbox.some(x => /Tamarins|RN1/.test(x.body || ''))")) || 'alerté à tort';
});
await t('dans le car : bouchon vu par un autre car jaune devant moi → alerte', async () => {
  incidents = [];
  const r = await p.evaluate(`(async () => {
    TF.key = ''; TF.incidents = []; trip.a = ''; trip.b = ''; tfTripCache = { key:'', lines:[] }; tfAlertLast = 0;
    const v = vehicles.find(x => x.route.s === 'E1') || vehicles[0];
    onBus = v.id;
    const st = motion[v.id]; if (!st || !st.line) return 'pas de tracé pour le car';
    const ahead = pointAt(st.line, st.s0 + (st.dir || 1) * 2500);
    TF.jams = { j1: { id:'j1', line: st.line, s: st.s0 + 2500, from: 0, to: 0, lat: ahead[0], lon: ahead[1], l:'E1X', near:'Duparc', t: Date.now() } };
    trafficAlertTick(); onBus = null; TF.jams = {};
    return (inbox[0] || {}).title || '';
  })()`);
  console.log('    ', r);
  return /Bouchon devant ton car \(à 2,5 km\)/.test(r) || r;
});
await t('réglage « Bouchons et accidents » : coupé = plus d’alerte', async () => {
  await p.evaluate("alertCfg.jam = false; tfAlertLast = 0; Object.keys(alertSent).forEach(k => delete alertSent[k]); trip.a = 'Gare de St-Denis'; trip.b = 'Gare de St-Benoît'; window.__n = inbox.length; trafficAlertTick(); alertCfg.jam = true; 1");
  return (await p.evaluate("inbox.length === window.__n")) || 'alerte malgré le réglage coupé';
});
errs.forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Alertes bouchons / accidents : tout est bon.');
