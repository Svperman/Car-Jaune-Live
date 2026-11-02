// Car Jaune Live — test des bus urbains (Citalis, Kar'Ouest, Alternéo, Car'Sud, Estival)
// Usage : node tests/urbain.mjs  (dossier servi sur http://localhost:8765, après smoke.mjs qui crée _test.html)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
// pas d'accès direct aux flux en test : l'appli doit passer par le serveur (faux serveur ici)
await page.route(/zenbus\.net|proxy\.transport\.data\.gouv/, r => r.abort());
await page.goto(BASE + '/_test.html');
await page.waitForTimeout(2500);
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };

await t('index des 5 réseaux', async () => { const n = await page.evaluate('urb.index && urb.index.nets.map(n => n.id).join(",")'); return n === 'citalis,karouest,alterneo,carsud,estival' || n; });
await t('réglages : 5 cases', async () => { const n = await page.evaluate('document.querySelectorAll("#urbNets [data-urb]").length'); return n === 5 || n; });
for (const [id, ll] of [['citalis', [-20.8789, 55.4481]], ['karouest', [-21.0094, 55.2697]], ['alterneo', [-21.3393, 55.4781]], ['carsud', [-21.2776, 55.5177]], ['estival', [-21.0341, 55.7124]]]){
  await t(id + ' : lignes et arrêts à l’écran', async () => {
    await page.evaluate(`map.setView([${ll}], 16, { animate:false }); 1`);
    await page.waitForFunction(`!!urb.nets['${id}']`, null, { timeout: 15000 });
    await page.waitForTimeout(600);
    const r = await page.evaluate('[urbLineLayer.getLayers().length, urbStopLayer.getLayers().length]');
    return (r[0] > 0 && r[1] > 0) || ('lignes ' + r[0] + ' arrêts ' + r[1]);
  });
  await t(id + ' : départs un mardi matin', async () => {
    const r = await page.evaluate(`(() => { const N = urb.nets['${id}'];
      const tue = midnightMs(Date.now()); let d = tue; while (reuDate(d).wd !== 1) d += 864e5;   // prochain mardi
      urbIndexStops(N);
      const busiest = Object.keys(N.at).sort((a, b) => N.at[b].length - N.at[a].length)[0];
      const rows = urbDepartures(N, [+busiest], d + 8 * 3600e3, 6);
      return [N.stops[busiest][0], rows.length, rows[0] && fmtHM(rows[0].eff), rows[0] && rows[0].route.s, rows[0] && rows[0].dest]; })()`);
    console.log('   ', id, JSON.stringify(r));
    return r[1] > 0 || 'aucun départ à ' + r[0];
  });
}
await t('popup d’un arrêt urbain', async () => {
  await page.evaluate(`(() => { const N = urb.nets.citalis; urbStopPopup(N, 0); })()`);
  await page.waitForTimeout(300);
  const h = await page.evaluate('document.querySelector(".leaflet-popup-content").innerText');
  return /Citalis/.test(h) || h;
});
await t('Alternéo : bus en direct (via serveur)', async () => {
  await page.evaluate("map.setView([-21.3393, 55.4781], 14, { animate:false }); urb.rtAt = {}; 1");
  await page.evaluate("urbRtFetch('alterneo')");
  const r = await page.evaluate("[urb.mode.alterneo, urb.veh.alterneo && urb.veh.alterneo.list.length, urbVehLayer.getLayers().length, urb.veh.alterneo && urb.veh.alterneo.list[0].delay, urb.veh.alterneo && urb.veh.alterneo.list[0].route.s]");
  console.log('    ', JSON.stringify(r));
  return (r[0] === 'srv' && r[1] === 1 && r[2] >= 1 && r[3] === 240) || JSON.stringify(r);
});
await t('décocher un réseau le masque', async () => {
  await page.evaluate(`(() => { const c = document.querySelector('[data-urb="alterneo"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles:true })); })()`);
  await page.waitForTimeout(200);
  const r = await page.evaluate('[urbVehLayer.getLayers().length, (urb.veh.carsud ? urb.veh.carsud.list.length : 0), JSON.parse(localStorage.getItem("cj_urb")).alterneo]');
  return (r[0] === r[1] && r[2] === false) || JSON.stringify(r);
});
await page.screenshot({ path: 'test-urbain.png' });
errs.forEach(e => fails.push('erreur JS : ' + e));
await browser.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Bus urbains : tout est bon.');
