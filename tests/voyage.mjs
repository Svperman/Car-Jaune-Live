// Car Jaune Live — test 🛎️ descente, 🔁 correspondance, 🔦 faire signe (avec le faux serveur tests/mock.js)
// Usage : node tests/voyage.mjs (après smoke.mjs, dossier servi sur :8765)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const t = async (label, fn) => {
  try { const r = await fn(); if (r === true) console.log('✓ ' + label); else { fails.push(label); console.log('✗ ' + label + ' : ' + r); } }
  catch (e) { fails.push(label); console.log('✗ ' + label + ' : ' + e.message.split('\n')[0]); }
};
const browser = await browser0();
async function browser0(){ return chromium.launch(); }
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/_test.html');
await page.waitForTimeout(2500);
await page.evaluate(`forceUntil = Date.now() + 3600e3; updateMode(); refresh();
  document.querySelectorAll('#geoSheet').forEach(e => e.hidden = true);
  // journal des alertes
  window.__notes = []; const n0 = notify; notify = (t, b, k, o) => { __notes.push(t + ' | ' + b); return n0(t, b, k, o); };
  1`);
await page.waitForTimeout(1200);
// parcours du car E1 (bus1) : St-Denis (A) → Ste-Marie (B) → St-Benoît (Z), 15 min puis 30 min
const setup = `(() => {
  const now = Date.now(), base = now - 5 * 60e3;          // parti il y a 5 min
  const st = (id, sec) => ({ id, sec, lat: S.stops[id][1], lon: S.stops[id][2] });
  tripGeomCache['T1'] = { stops: [st('A', 0), st('B', 15 * 60), st('Z', 45 * 60)] };
  const v = vehicles.find(x => x.id === 'bus1');
  v.tripId = 'T1'; v.delay = 0; v.est = { next: 1, base, delay: 0 };
  v.lat = -20.89; v.lon = 55.49;                           // entre A et B
  onBus = 'bus1';
  return v;
})()`;

await t('🛎️ choix de l’arrêt dans la fiche du car', async () => {
  await page.evaluate(setup);
  const h = await page.evaluate("popupFor(vehicles.find(x => x.id === 'bus1'))");
  return (/data-descsel/.test(h) && /Sainte-Marie Duparc/.test(h) && /Gare de St-Benoît/.test(h)) || h.slice(-400);
});
await t('🛎️ rappel 2 arrêts avant (« prépare-toi »)', async () => {
  const r = await page.evaluate(`(() => { __notes.length = 0; setDescPick('Gare de St-Benoît');
    return [__notes.filter(n => /Prépare-toi/.test(n)).length, !document.querySelector('#descChip').hidden, document.querySelector('#descChip').innerText]; })()`);
  return (r[0] === 1 && r[1] && /St-Benoît/.test(r[2]) && /1 arrêt|2 arrêts/.test(r[2])) || JSON.stringify(r);
});
await t('🛎️ « descends au prochain arrêt » : écran jaune + son, une seule fois', async () => {
  const r = await page.evaluate(`(() => { __notes.length = 0;
    const v = vehicles.find(x => x.id === 'bus1'); v.est.next = 2; v.lat = -21.03; v.lon = 55.70;   // à ~1 km de St-Benoît
    descTick(); descTick();
    return [__notes.filter(n => /Descends au prochain arrêt/.test(n)).length, !document.querySelector('#descAlarm').hidden, document.querySelector('#descAlName').textContent]; })()`);
  await page.click('#descAlOk');
  const closed = await page.evaluate("document.querySelector('#descAlarm').hidden");
  return (r[0] === 1 && r[1] && r[2] === 'Gare de St-Benoît' && closed) || JSON.stringify([r, closed]);
});
await t('🛎️ ✕ annule le réveil', async () => {
  await page.evaluate("setDescPick('Gare de St-Benoît'); document.querySelector('#descChip [data-descoff]').click(); 1");
  const r = await page.evaluate("[descPick, localStorage.getItem('cj_desc'), document.querySelector('#descChip').hidden]");
  return (r[0] === null && r[1] === null && r[2]) || JSON.stringify(r);
});
await t('🛎️ sans choix : l’arrivée de Mon trajet', async () => {
  const r = await page.evaluate(`(() => { const v = vehicles.find(x => x.id === 'bus1'); v.est.next = 1; v.lat = -20.89; v.lon = 55.49;
    const tr0 = tripReady, ds0 = detectSens;
    tripReady = () => true; detectSens = () => ({ sens:'aller', A: findGroup('Gare de St-Denis'), B: findGroup('Gare de St-Benoît') });
    const s = descState(v); tripReady = tr0; detectSens = ds0; return s && [s.name, s.left, s.manual]; })()`);
  return (r && r[0] === 'Gare de St-Benoît' && r[1] === 1 && r[2] === false) || JSON.stringify(r);
});

// ---------- 🔁 correspondance : E1 jusqu'à Ste-Marie (B), puis un S9 vers St-Pierre ----------
const corrSetup = (delayMin) => `(() => {
  const now = Date.now(), v = vehicles.find(x => x.id === 'bus1');
  v.est = { next: 1, base: now - 5 * 60e3, delay: ${delayMin} * 60 }; v.delay = ${delayMin} * 60;   // arrivée prévue à B : dans 10 min (+ retard)
  tripReady = () => true;
  const A = findGroup('Gare de St-Denis'), B = findGroup('Sainte-Marie Duparc'), P = findGroup('Gare de St-Pierre');
  detectSens = () => ({ sens:'aller', A, B: P });
  tripBoard.data = tripBoard.data || {};
  transfer = { key: transferKey(A, P), loading:false, done:true, hubs:[{ X1: B, X2: B, walk: 0, walkM: 0 }] };
  const row = m => ({ route:{ s:'S9', c:'F6BE00', t:'222222' }, sched: now + m * 60e3, eff: now + m * 60e3, arr: now + (m + 50) * 60e3, rarr: null, dest: P.name });
  journeyRows = (X, to) => X.name === 'Sainte-Marie Duparc' ? [row(15), row(45)] : [];
  corrSent = {}; __notes.length = 0; corrTick();
  return __notes.slice();
})()`;
await t('🔁 à l’heure : pas d’alerte', async () => {
  const n = await page.evaluate(corrSetup(0));
  return n.length === 0 || JSON.stringify(n);
});
await t('🔁 correspondance serrée (+1 min)', async () => {
  const n = await page.evaluate(corrSetup(1.5));
  return (n.length === 1 && /serrée/.test(n[0])) || JSON.stringify(n);
});
await t('🔁 correspondance ratée (+4 min) : le suivant tout de suite', async () => {
  const n = await page.evaluate(corrSetup(4));
  const again = await page.evaluate('corrTick(); __notes.length');
  return (n.length === 1 && /ratée/.test(n[0]) && /Prochain : S9/.test(n[0]) && again === 1) || JSON.stringify([n, again]);
});

// ---------- 🔦 faire signe ----------
await t('🔦 à l’arrêt, un car arrive : le bouton apparaît et pulse', async () => {
  const r = await page.evaluate(`(() => { __notes.length = 0; onBus = null;
    const st = (id, sec) => ({ id, sec, lat: S.stops[id][1], lon: S.stops[id][2] });
    tripGeomCache['T1'] = { stops: [st('P', 0), st('A', 60 * 60), st('B', 75 * 60)] };
    const v = vehicles.find(x => x.id === 'bus1'); v.est = { next: 1, base: Date.now() - 58 * 60e3, delay: 0 };
    v.lat = -20.882; v.lon = 55.452;                       // ~500 m de la gare
    ride = { phase:'wait', stop:'Gare de St-Denis', since: Date.now(), sent:{}, veh:'', info:null };
    signNotif = {}; signTick();
    const b = document.querySelector('#signBtn');
    return [!b.hidden, b.classList.contains('pulse'), __notes.filter(n => /fais signe/.test(n)).length]; })()`);
  return (r[0] && r[1] && r[2] === 1) || JSON.stringify(r);
});
await t('🔦 écran clignotant avec la ligne, puis Fermer', async () => {
  await page.evaluate("document.querySelector('#signBtn').click(); 1");
  const r = await page.evaluate("[!document.querySelector('#signOv').hidden, document.querySelector('#signLine').textContent, getComputedStyle(document.querySelector('#signOv')).animationName]");
  await page.click('#signClose');
  const closed = await page.evaluate("document.querySelector('#signOv').hidden");
  return (r[0] && r[1] === 'E1' && r[2] === 'sgFlash' && closed) || JSON.stringify([r, closed]);
});
await t('🔦 bouton aussi dans Horaires', async () => {
  const n = await page.evaluate(`(async () => { ride.phase = 'idle'; setView('board'); await selectStop(findGroup('Gare de St-Denis')); renderBoard(); return document.querySelectorAll('#boardCard [data-sign]').length; })()`);
  return n === 1 || n;
});
// ---------- 🌀 vigilance météo / cyclone ----------
await t('🌀 rien à signaler : pas de bandeau, carte verte dans Infos trafic', async () => {
  const r = await page.evaluate(`(async () => { setView('map'); window.__vigi = null; await vigiLoad();
    return [document.querySelector('#vigiBar').hidden, document.querySelector('#vigiBox').innerText]; })()`);
  return (r[0] && /Pas de vigilance/.test(r[1])) || JSON.stringify(r);
});
await t('🌀 alerte rouge cyclonique : bandeau rouge + alerte', async () => {
  const r = await page.evaluate(`(async () => { __notes.length = 0;
    window.__vigi = { ok:true, at: Date.now(), level:1, cyc:9, phen:[{ id:10, name:'Cyclone', c:9 }, { id:9, name:'Vagues-submersion', c:4 }], text:'ALERTE ROUGE CYCLONIQUE\\nConfinement.', upd: new Date().toISOString() };
    await vigiLoad();
    const b = document.querySelector('#vigiBar');
    return [!b.hidden, b.innerText, getComputedStyle(b).backgroundColor, __notes.filter(n => /Alerte rouge cyclonique/.test(n)).length, document.querySelector('#vigiBox').innerText]; })()`);
  return (r[0] && /Alerte rouge cyclonique/.test(r[1]) && /ne roulent pas/.test(r[1]) && r[2] === 'rgb(227, 0, 27)' && r[3] === 1 && /Bulletin/.test(r[4])) || JSON.stringify(r);
});
await t('🌀 toucher le bandeau ouvre Infos trafic, ✕ le masque', async () => {
  await page.evaluate("document.querySelector('#vigiBar .vg-tx').click(); 1");
  const v = await page.evaluate('view');
  await page.evaluate("setView('map'); document.querySelector('#vigiBar [data-vigix]').click(); 1");
  const hidden = await page.evaluate("document.querySelector('#vigiBar').hidden");
  return (v === 'trafic' && hidden) || JSON.stringify([v, hidden]);
});
await t('🌀 vigilance orange fortes pluies', async () => {
  const r = await page.evaluate(`(async () => { __notes.length = 0;
    window.__vigi = { ok:true, at: Date.now(), level:3, cyc:-1, phen:[{ id:12, name:'Fortes pluies et orages', c:3 }, { id:10, name:'Cyclone', c:-1 }], text:'', upd: new Date().toISOString() };
    await vigiLoad(); const b = document.querySelector('#vigiBar');
    return [!b.hidden, b.innerText, __notes.length]; })()`);
  return (r[0] && /Vigilance orange fortes pluies et orages/.test(r[1]) && r[2] === 1) || JSON.stringify(r);
});
await t('aucune erreur JavaScript', async () => errs.length === 0 || errs.join(' / '));
await browser.close();
if (fails.length){ console.log(`✗ ${fails.length} problème(s)`); process.exit(1); }
console.log('✓ Descente, correspondance, faire signe et vigilance météo : tout est bon.');
