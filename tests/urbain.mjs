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
// ---------- 🕒 Horaires : chercher un arrêt de bus de ville ----------
await t('Horaires : un arrêt Citalis dans la recherche', async () => {
  await page.evaluate("setView('board'); 1");
  await page.waitForFunction('!!urbStopGroups', null, { timeout: 15000 });
  await page.fill('#stopInput', 'hotel de ville ste marie');
  await page.dispatchEvent('#stopInput', 'input');
  await page.waitForTimeout(200);
  const r = await page.evaluate('[...document.querySelectorAll("#suggest li")].map(li => li.innerText.replace(/\\s+/g, " "))');
  return r.some(x => /Citalis/.test(x)) || JSON.stringify(r);
});
await t('Horaires : départs de l’arrêt urbain (un mardi matin)', async () => {
  const r = await page.evaluate(`(async () => {
    const g = urbStopGroups.find(x => x.urb.net === 'citalis' && /Hôtel de Ville de Ste Marie/.test(x.stop));
    let d = midnightMs(Date.now()); while (reuDate(d).wd !== 1) d += 864e5;
    const real = Date.now; Date.now = () => d + 8 * 3600e3;
    try { await selectStop(g); renderBoard(); } finally { Date.now = real; }
    return [document.querySelectorAll('#boardCard table.board tbody tr:not(.sep)').length, document.querySelectorAll('#boardCard [data-urbline]').length, document.querySelector('#boardCard h2').innerText, localStorage.getItem('cj_stop')];
  })()`);
  console.log('   ', JSON.stringify(r));
  return (r[0] > 3 && r[1] > 0 && /Ste Marie/.test(r[2]) && /· Citalis$/.test(r[3])) || JSON.stringify(r);
});
await t('Horaires : favori ★ sur un arrêt urbain', async () => {
  await page.click('#favBtn');
  const r = await page.evaluate('[...document.querySelectorAll("#favs [data-stop]")].map(b => b.dataset.stop)');
  return r.some(x => /· Citalis$/.test(x)) || JSON.stringify(r);
});
// ---------- 📄 Fiches : une fiche par ligne ----------
await t('Fiches : la fiche d’une ligne depuis l’arrêt', async () => {
  await page.evaluate(`(async () => { const b = document.querySelector('#boardCard [data-urbline]'); const [n, ri] = b.dataset.urbline.split('|'); await openUrbFiche(n, +ri, 'sem'); })()`);
  await page.waitForTimeout(200);
  const r = await page.evaluate('[!document.querySelector("#ficheModal").hidden, document.querySelectorAll("#ficheModalBox .dir-h").length, document.querySelectorAll("#ficheModalBox table.fiche td").length, document.querySelectorAll("#ficheModalBox tr.here").length]');
  return (r[0] && r[1] >= 1 && r[2] > 20 && r[3] >= 1) || JSON.stringify(r);
});
await t('Fiches : dimanche (ou pas de service) sans erreur', async () => {
  await page.click('#ficheModalBox [data-urbday="dim"]');
  await page.waitForTimeout(200);
  const r = await page.evaluate('[document.querySelectorAll("#ficheModalBox .dir-h").length, !!document.querySelector("#ficheModalBox .placeholder"), document.querySelector("#ficheModalBox .chip.on").innerText]');
  await page.evaluate("document.querySelector('#ficheModal').hidden = true; 1");
  return ((r[0] > 0 || r[1]) && r[2] === 'Dimanche') || JSON.stringify(r);
});
await t('Fiches : les 5 réseaux et leurs lignes', async () => {
  await page.evaluate("setView('fiches'); 1");
  const n = await page.evaluate('document.querySelectorAll("#urbFiches details.urb-fc").length');
  await page.evaluate(`document.querySelector('#urbFiches details[data-net="karouest"] summary').click(); 1`);
  await page.waitForFunction('document.querySelectorAll("#urbFiches details[data-net=karouest] .urb-line").length > 10', null, { timeout: 15000 });
  await page.evaluate(`document.querySelector('#urbFiches details[data-net="karouest"] .urb-line').click(); 1`);
  await page.waitForTimeout(300);
  const r = await page.evaluate('[document.querySelectorAll("#urbFiches details[data-net=karouest] .urb-line").length, !document.querySelector("#ficheModal").hidden, /Kar/.test(document.querySelector("#ficheModalBox").innerText)]');
  await page.evaluate("document.querySelector('#ficheModal').hidden = true; 1");
  return (n === 5 && r[1] && r[2]) || JSON.stringify([n, r]);
});
// ---------- ≈ bus estimés d'après l'horaire ----------
await t('≈ bus estimés : Citalis un mardi à 8 h, sur le tracé', async () => {
  const r = await page.evaluate(`(() => {
    let d = midnightMs(Date.now()); while (reuDate(d).wd !== 1) d += 864e5;
    const real = Date.now; Date.now = () => d + 8 * 3600e3;
    try { setView('map'); map.invalidateSize(); map.setView([-20.8789, 55.4481], 14, { animate:false }); urbEstTick(); } finally { Date.now = real; }
    const list = [...urbEstMk.values()];
    // chaque bus estimé est à moins de 1,5 km d'un arrêt de sa course
    const far = list.filter(mk => { const { N, ti } = mk._u, ll = mk.getLatLng();
      return !N.pats[N.trips[ti][3]].some(si => distM(ll.lat, ll.lng, N.stops[si][1], N.stops[si][2]) < 1500); }).length;
    return [list.length, far, document.querySelectorAll('.bus-mk.urb.est').length];
  })()`);
  console.log('   ', JSON.stringify(r));
  return (r[0] > 3 && r[1] === 0 && r[2] === r[0]) || JSON.stringify(r);
});
await t('≈ bus estimés : popup « position estimée »', async () => {
  const h = await page.evaluate(`(() => { const mk = [...urbEstMk.values()][0]; mk.openPopup(); return document.querySelector('.leaflet-popup-content').innerText; })()`);
  return /estimée/.test(h) && /Prochain arrêt|terminée/.test(h) || h;
});
await t('≈ bus estimés : se coupent dans les réglages', async () => {
  const r = await page.evaluate(`(() => { const c = document.querySelector('#urbEst'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles:true }));
    const n = urbEstMk.size; c.checked = true; c.dispatchEvent(new Event('change', { bubbles:true })); return [n, localStorage.getItem('cj_urb_est')]; })()`);
  return (r[0] === 0 && r[1] === '1') || JSON.stringify(r);
});
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
  await page.evaluate("setView('map'); 1");
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
