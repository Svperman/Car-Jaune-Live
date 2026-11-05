// Car Jaune Live — test : affichage quand je me déplace (point bleu fluide, mon car collé à moi, je reste à l'écran)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{ width:390, height:844 }, hasTouch:true, geolocation:{ latitude:-20.8823, longitude:55.4504, accuracy:8 }, permissions:['geolocation'] });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.route(/openstreetmap|cartocdn|arcgis/, r => r.abort());
await p.goto(BASE + '/_test.html'); await p.waitForTimeout(2500);
await p.evaluate("document.querySelector('#geoSheet').hidden = true; forceUntil = Date.now() + 3600e3; updateMode(); refresh(); 1"); await p.waitForTimeout(1200);
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };
await p.click('#btnMe'); await p.waitForTimeout(1500);

await t('point bleu : avance sans reculer (positions toutes les secondes)', async () => {
  // 10 positions vers l'ouest, une par 300 ms (plus rapide que l'animation de 900 ms) : la longitude ne doit jamais remonter
  const r = await p.evaluate(`(async () => {
    const seen = []; let back = 0, last = null;
    const iv = setInterval(() => { const x = meMarker.getLatLng().lng; if (last != null && x > last + 1e-7) back++; last = x; seen.push(x); }, 30);
    for (let i = 1; i <= 10; i++){ myPos = { lat: -20.8823, lon: 55.4504 - i * 0.0003, acc: 8, speed: 10 }; myFixAt = Date.now(); showMeOnMap(); await new Promise(r => setTimeout(r, 300)); }
    await new Promise(r => setTimeout(r, 1200)); clearInterval(iv);
    return [back, Math.abs(meMarker.getLatLng().lng - (55.4504 - 0.003)) < 1e-6];
  })()`);
  return (r[0] === 0 && r[1]) || 'reculs : ' + r[0] + ', arrivé : ' + r[1];
});
await t('je reste à l’écran quand je bouge', async () => {
  const r = await p.evaluate(`(async () => {
    userMovedAt = 0; map.setView([-20.8823, 55.4504], 17, { animate:false });
    for (let i = 1; i <= 8; i++){ myPos = { lat: -20.8823, lon: 55.4504 - i * 0.0008, acc: 8, speed: 12 }; myFixAt = Date.now(); showMeOnMap(); await new Promise(r => setTimeout(r, 900)); }
    await new Promise(r => setTimeout(r, 900));
    const pt = map.latLngToContainerPoint([myPos.lat, myPos.lon]), sz = map.getSize();
    return pt.x > 0 && pt.x < sz.x && pt.y > 0 && pt.y < sz.y;
  })()`);
  return r === true || 'sorti de l’écran';
});
await t('je déplace la carte moi-même : elle ne me ramène pas de force', async () => {
  const r = await p.evaluate(`(async () => {
    map.setView([-21.2, 55.5], 13, { animate:false }); userMovedAt = Date.now();
    myPos = { lat: -20.8823, lon: 55.44, acc: 8, speed: 12 }; myFixAt = Date.now(); showMeOnMap();
    await new Promise(r => setTimeout(r, 900));
    return map.getCenter().lat < -21.1;
  })()`);
  return r === true || 'la carte est revenue sur moi';
});
await t('dans le car : son icône reste collée à ma position', async () => {
  const r = await p.evaluate(`(async () => {
    const v = vehicles[0]; onBus = v.id;
    myPos = { lat: v.lat + 0.004, lon: v.lon + 0.004, acc: 10, speed: 15 }; myFixAt = Date.now();
    await new Promise(r => setTimeout(r, 2200));
    const m = markers.get(v.id).getLatLng(); onBus = null;
    return distM(m.lat, m.lng, myPos.lat, myPos.lon);
  })()`);
  return r < 5 || `car affiché à ${Math.round(r)} m de moi`;
});
errs.forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Affichage en déplacement : tout est bon.');
