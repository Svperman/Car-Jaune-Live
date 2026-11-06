// Car Jaune Live — test du zoom de la carte au doigt (pincer pour zoomer / dézoomer), boutons + et −, limites
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{ width:390, height:844 }, hasTouch:true, isMobile:true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.route(/openstreetmap|cartocdn|arcgis/, r => r.abort());
await p.goto(BASE + '/_test.html'); await p.waitForTimeout(2500);
await p.evaluate("document.querySelector('#geoSheet').hidden = true; map.setView([-21.0, 55.5], 12, { animate:false }); 1");
const cdp = await ctx.newCDPSession(p);
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };
/** Pincement à deux doigts côte à côte (horizontal), de écart d0 à d1 px. */
async function pinch(d0, d1, tilt = 0){
  const cx = 195, cy = 420, steps = 12;
  const pts = d => [{ x: cx - d / 2, y: cy - tilt * d / 200, id: 0 }, { x: cx + d / 2, y: cy + tilt * d / 200, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints: pts(d0) });
  for (let i = 1; i <= steps; i++){ await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints: pts(d0 + (d1 - d0) * i / steps) }); await p.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints: [] });
  await p.waitForTimeout(600);
}
await t('pincer pour zoomer (doigts à l’horizontale) : zoom +, carte qui ne tourne pas', async () => {
  const z0 = await p.evaluate('map.getZoom()'); await pinch(80, 240, 3);
  const r = await p.evaluate('[map.getZoom(), mapBearing()]');
  return (r[0] > z0 + 1 && Math.abs(r[1]) < 0.01) || `zoom ${z0} → ${r[0]}, rotation ${r[1].toFixed(1)}°`;
});
await t('pincer pour dézoomer : zoom −, carte qui ne tourne pas', async () => {
  const z0 = await p.evaluate('map.getZoom()'); await pinch(240, 80, -3);
  const r = await p.evaluate('[map.getZoom(), mapBearing()]');
  return (r[0] < z0 - 1 && Math.abs(r[1]) < 0.01) || `zoom ${z0} → ${r[0]}, rotation ${r[1].toFixed(1)}°`;
});
await t('boutons + et −', async () => {
  const z0 = await p.evaluate('map.getZoom()');
  await p.tap('.leaflet-control-zoom-in'); await p.waitForTimeout(500);
  const z1 = await p.evaluate('map.getZoom()');
  await p.tap('.leaflet-control-zoom-out'); await p.waitForTimeout(500);
  const z2 = await p.evaluate('map.getZoom()');
  return (z1 > z0 && Math.abs(z2 - z0) < 0.01) || `${z0} → ${z1} → ${z2}`;
});
await t('toucher deux fois la carte : zoom +', async () => {
  await p.evaluate("map.setView([-21.0, 55.5], 12, { animate:false }); 1"); await p.waitForTimeout(200);
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:200, y:450 }] }); await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await p.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:200, y:450 }] }); await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await p.waitForTimeout(700);
  const z = await p.evaluate('map.getZoom()'); return z > 12.5 || 'zoom ' + z;
});
await t('carte du monde : on peut dézoomer jusqu’au monde entier, puis revenir sur l’île', async () => {
  await p.evaluate('map.setZoom(2, { animate:false }); 1'); await p.waitForTimeout(300);
  const z = await p.evaluate('map.getZoom()');
  await p.tap('#btnFit'); await p.waitForTimeout(1200);
  const r = await p.evaluate('[map.getZoom(), map.getBounds().contains([-21.1, 55.5])]');
  return (z <= 2.5 && r[0] >= 8 && r[1]) || JSON.stringify([z, r]);
});
await t('la page elle-même ne zoome pas (seulement la carte)', async () => (await p.evaluate('visualViewport.scale')) === 1 || 'échelle ' + await p.evaluate('visualViewport.scale'));
errs.forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Zoom de la carte : tout est bon.');
