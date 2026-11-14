// Car Jaune Live — scénarios tirés des journaux de trajet des 9, 10 et 12 novembre 2026.
// Usage : node tests/journaux.mjs (après smoke.mjs, dossier servi sur :8765)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const t = async (label, fn) => {
  try { const r = await fn(); if (r === true) console.log('✓ ' + label); else { fails.push(label); console.log('✗ ' + label + ' : ' + r); } }
  catch (e) { fails.push(label); console.log('✗ ' + label + ' : ' + e.message.split('\n')[0]); }
};
const b = await chromium.launch();
const pg = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/_test.html'); await pg.waitForTimeout(2500);
await pg.evaluate("forceUntil = Date.now() + 3600e3; updateMode(); refresh(); document.querySelector('#geoSheet').hidden = true; 1"); await pg.waitForTimeout(1200);

// Arrêt « Campus » (terminus de l'O1X Express) ajouté au faux réseau, et mis dans les arrêts ignorés comme chez Samuel
const SETUP = `(() => {
  if (!S.stops.C){ S.stops.C = ['Campus', -20.900776, 55.486723]; stopGroups.push({ name:'Campus', key:'campus', ids:['C'], lat:-20.900776, lon:55.486723, wb:'' }); }
  if (!IGNORED.includes('Campus')) IGNORED.push('Campus');
  const st = (id, sec) => ({ id, sec, lat: S.stops[id][1], lon: S.stops[id][2] });
  tripGeomCache['TX'] = { stops: [st('A', 0), st('C', 12 * 60)] };
  window.__evs = []; shareEvent = ev => __evs.push(ev.k + '@' + (ev.stop || ''));
  shareCfg.auto = true; shareCfg.name = 'Samuel';
})()`;

await t('12/11 · terminus Campus : descendu dès qu’on s’éloigne du car garé (pas 4 min après), arrêt bien nommé', async () => {
  const r = await pg.evaluate(`(() => { ${SETUP};
    let T = Date.now(); const real = Date.now; Date.now = () => T;
    const v = Object.assign({}, vehicles[0], { id:'O1X', route:{ s:'O1X', c:'F6BE00', t:'222222' }, tripId:'TX', headsign:'St-Denis Express', lat:-20.900776, lon:55.486723, age: 5e3, bearing: 0, est:null, times:null });
    vehicles = [v]; onBus = 'O1X'; busLastOk = T; alightPos = null;
    ride = { phase:'ride', stop:'Gare de St-Denis', since: T - 15 * 60e3, sent:{}, veh:'O1X', info:{ to:'Campus' } };
    const log = [];
    for (let s = 0; s < 120; s++){                   // je marche lentement (1 m/s) vers le sud-ouest, le car reste garé
      T += 1000; myPos = { lat: -20.900776 - s * 0.6 / 111000, lon: 55.486723 - s * 0.6 / 104000, acc: 10, speed: 1 }; myFixAt = T;
      detectMyBus(); rideTick(); log.push(onBus ? 1 : 0);
    }
    Date.now = real;
    return [log.indexOf(0), __evs.slice()]; })()`);
  // à 1 m/s en diagonale (~0,85 m/s) : plus de 50 m après ~60 s
  return (r[0] > 0 && r[0] < 75 && r[1].some(e => e === 'arrive@Campus')) || JSON.stringify(r);
});

await t('10/11 · appli ouverte dans le car à 80 km/h : car reconnu en 2 min (et non plus jamais)', async () => {
  const r = await pg.evaluate(`(() => {
    let T = Date.now() + 3600e3; const real = Date.now; Date.now = () => T;
    gpsLastAt = 0; gpsStartAt = 0; onBus = null; busCand = null; lastWait = null; ride = { phase:'idle', stop:'', since:0, sent:{}, veh:'', info:null };
    const v = Object.assign({}, vehicles[0], { id:'O3', route:{ s:'O3', c:'F6BE00', t:'222222' }, headsign:'St-Paul', bearing: 200, est:null, times:null, tripId:null });
    let first = -1;
    for (let s = 0; s < 200; s++){
      T += 1000;
      const lat = -20.9713 - s * 22 * 0.94 / 111000, lon = 55.2983 - s * 22 * 0.34 / 104000;     // 80 km/h vers le sud-sud-ouest
      myPos = { lat, lon, acc: 8, speed: 22 }; myFixAt = T;
      const j = (s % 7) * 40 - 120;                                                                // position estimée du car qui saute (±120 m)
      Object.assign(v, { lat: lat + j * 0.94 / 111000, lon: lon + j * 0.34 / 104000, age: 15e3 }); vehicles = [v];
      detectMyBus(); if (onBus && first < 0) first = s;
    }
    Date.now = real; return first; })()`);
  return (r >= 110 && r <= 140) || 'reconnu à ' + r + ' s';
});

await t('10/11 · même situation mais GPS déjà actif avant (voiture qui suit un car) : pas reconnu avant 6 min', async () => {
  const r = await pg.evaluate(`(() => {
    let T = Date.now() + 7200e3; const real = Date.now; Date.now = () => T;
    onBus = null; busCand = null; lastWait = null;
    gpsLastAt = T - 1000; gpsStartAt = T - 20 * 60e3;                // GPS allumé depuis 20 min
    const v = Object.assign({}, vehicles[0], { id:'S4', route:{ s:'S4', c:'F6BE00', t:'222222' }, headsign:'St-Pierre', bearing: 200, est:null, times:null, tripId:null });
    let first = -1;
    for (let s = 0; s < 200; s++){
      T += 1000; const lat = -20.9713 - s * 22 * 0.94 / 111000, lon = 55.2983 - s * 22 * 0.34 / 104000;
      myPos = { lat, lon, acc: 8, speed: 22 }; myFixAt = T;
      Object.assign(v, { lat: lat + 30 / 111000, lon, age: 10e3 }); vehicles = [v];
      detectMyBus(); if (onBus && first < 0) first = s;
    }
    Date.now = real; onBus = null; return first; })()`);
  return r === -1 || 'reconnu à tort à ' + r + ' s';
});

await t('09/11 · dans le car, pas d’alertes « Gare de St-Paul » quand on roule loin (Saint-Denis)', async () => {
  const r = await pg.evaluate(`(async () => {
    window.__n = []; const n0 = notify; notify = (t, b) => __n.push(t);
    setAlertsOn(true, true); setView('board'); await selectStop(findGroup('Gare de St-Pierre'));
    for (const k in alertSent) delete alertSent[k];
    onBus = 'bus1'; myPos = { lat: -20.8916, lon: 55.4755, acc: 8, speed: 8 };
    checkAlerts(); const inBus = __n.length;
    onBus = null; for (const k in alertSent) delete alertSent[k]; checkAlerts(); const after = __n.length - inBus;
    notify = n0; return [inBus, after]; })()`);
  return (r[0] === 0) || JSON.stringify(r);
});

await t('🛎️ arrêt habituel : sans choix ni Mon trajet, l’appli reprend l’arrêt où je descends d’habitude sur cette ligne', async () => {
  const r = await pg.evaluate(`(() => {
    const st = (id, sec) => ({ id, sec, lat: S.stops[id][1], lon: S.stops[id][2] });
    tripGeomCache['T1'] = { stops: [st('A', 0), st('B', 15 * 60), st('Z', 45 * 60)] };
    const v = Object.assign({}, vehicles[0], { id:'bus1', route:{ s:'E1', c:'F6BE00', t:'222222' }, tripId:'T1', est:{ next: 1, base: Date.now() - 5 * 60e3, delay: 0 } }); vehicles = [v];
    descPick = null; tripReady = () => false;
    rides = [{ t0: 1, t1: 2, l: v.route.s, to: 'Sainte-Marie Duparc', km: 9 }, { t0: 3, t1: 4, l: v.route.s, to: 'Sainte-Marie Duparc', km: 9 }];
    const s = descState(v); return s && [s.name, s.habit]; })()`);
  return (r && r[0] === 'Sainte-Marie Duparc' && r[1] === true) || JSON.stringify(r);
});
await t('14/11 · « Tu es dans le … ? » après 20 s collé au car, « Oui » → le car se met sur ma position', async () => {
  const r = await pg.evaluate(`(async () => {
    let T = Date.now() + 9000e3; const real = Date.now; Date.now = () => T;
    onBus = null; busCand = null; lastWait = null; manualBus = null; busNo = {}; document.querySelector('#busAsk').hidden = true;
    gpsLastAt = T - 1000; gpsStartAt = T - 20 * 60e3;
    const v = Object.assign({}, vehicles[0], { id:'O1X', route:{ s:'O1X', c:'F6BE00', t:'222222' }, headsign:'St-Denis Express', bearing: 90, est:null, times:null, tripId:null });
    let asked = -1;
    for (let s = 0; s < 40; s++){
      T += 1000; const lat = -20.8916, lon = 55.4755 + s * 12 / 104000;
      myPos = { lat, lon, acc: 8, speed: 12 }; myFixAt = T;
      Object.assign(v, { lat, lon: lon - 250 / 104000 + 0.0006, age: 30e3 }); vehicles = [v];      // le flux le place ~200 m derrière moi
      detectMyBus(); if (!document.querySelector('#busAsk').hidden && asked < 0) asked = s;
    }
    const dbg = [busCand && busCand.n, busCand && busCand.minD, document.querySelector('#busAsk').dataset.id];
    document.querySelector('#busAskYes') && document.querySelector('#busAskYes').click();
    const ok = onBus === 'O1X';
    // le car garde ma position même si le flux le met 1 km derrière, tant que je roule
    for (let s = 0; s < 120; s++){ T += 1000; myPos = { lat: -20.8916, lon: 55.4755 + (40 + s) * 12 / 104000, acc: 8, speed: 12 }; myFixAt = T;
      Object.assign(v, { lon: myPos.lon - 1000 / 104000, age: 40e3 }); detectMyBus(); }
    const kept = onBus === 'O1X';
    Date.now = real; setView('map'); motion['O1X'] = motion['O1X'] || { t0: Date.now(), lat: v.lat, lon: v.lon, bearing: 90, speed: 0 };
    if (!markers.has('O1X')) render();
    myFixAt = Date.now(); lastMove = 0; await new Promise(r => setTimeout(r, 1900));
    const m = markers.get('O1X'), ll = m ? m.getLatLng() : null;
    const d = ll ? Math.round(distM(ll.lat, ll.lng, myPos.lat, myPos.lon)) : null;
    onBus = null; manualBus = null;
    return [asked, ok, kept, d, dbg]; })()`);
  return (r[0] >= 18 && r[0] <= 25 && r[1] && r[2] && r[3] != null && r[3] < 15) || JSON.stringify(r);
});
await t('aucune erreur JavaScript', async () => errs.length === 0 || errs.join(' / '));
await b.close();
if (fails.length){ console.log(`✗ ${fails.length} problème(s)`); process.exit(1); }
console.log('✓ Scénarios des journaux : tout est bon.');
