// Car Jaune Live — test 📈 arrivée réaliste, 🚶 pars maintenant, 📊 mon bilan, ✈️ prendre l'avion
// Usage : node tests/plus.mjs (après smoke.mjs, dossier servi sur :8765)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const t = async (label, fn) => {
  try { const r = await fn(); if (r === true) console.log('✓ ' + label); else { fails.push(label); console.log('✗ ' + label + ' : ' + r); } }
  catch (e) { fails.push(label); console.log('✗ ' + label + ' : ' + e.message.split('\n')[0]); }
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
const AIR = `if (!S.stops.R){ S.stops.R = ['Aéroport Roland Garros', -20.887, 55.516]; stopGroups.push({ name:'Aéroport Roland Garros', key:'aeroport roland garros', ids:['R'], lat:-20.887, lon:55.516, wb:'' }); }`;
await page.goto(BASE + '/_test.html');
await page.waitForTimeout(2500);
await page.evaluate(`forceUntil = Date.now() + 3600e3; updateMode(); refresh(); document.querySelector('#geoSheet').hidden = true;
  window.__notes = []; const n0 = notify; notify = (t, b, k, o) => { __notes.push(t + ' | ' + b); return n0(t, b, k, o); }; 1`);
await page.waitForTimeout(1000);

await t('📈 retard habituel : arrivée réaliste et mention « d’habitude »', async () => {
  const r = await page.evaluate(`(() => {
    const at = Date.now() + 3600e3;
    STATSW.E1 = []; STATSW.E1[wSlot(at)] = [10, 10 * 480];          // 8 min de retard en moyenne à ce moment-là
    const row = { route:{ s:'E1', c:'F6BE00', t:'222222' }, sched: at, eff: at, real: null, arr: at + 30 * 60e3, rarr: null };
    return [Math.round((probArr(row) - row.arr) / 60000), habitHtml(row), habitDelay('E1', at).when];
  })()`);
  return (r[0] === 8 && /d’habitude \+8 min/.test(r[1]) && /vers \d+ h/.test(r[2])) || JSON.stringify(r);
});
await t('📈 pas assez de mesures : on ne devine rien', async () => {
  const r = await page.evaluate(`(() => { const at = Date.now() + 3600e3; STATSW.E1[wSlot(at)] = [2, 2 * 900]; delete STATS.E1;
    const row = { route:{ s:'E1' }, sched: at, arr: at + 30 * 60e3, rarr: null, real: null }; return probArr(row) === row.arr && habitHtml(row) === ''; })()`);
  return r === true || r;
});

// 🚶 pars maintenant : le car passe à la Gare de St-Denis, je suis à ~700 m (≈ 11 min à pied)
const leaveSetup = mins => `(() => {
  const now = Date.now(); tripBoard.data = tripBoard.data || {};
  window.__eff = window.__eff || now + ${mins} * 60e3;
  journeyRows = (A, B) => [{ route:{ s:'E1', c:'F6BE00', t:'222222' }, sched: __sched, eff: __eff, real: null, arr: __eff + 40 * 60e3, rarr: null }];
  myPos = { lat: -20.879 + 0.0063, lon: 55.448, acc: 10, speed: 0 }; onBus = null;
  return walkMin(distM(myPos.lat, myPos.lon, -20.879, 55.448));
})()`;
await t('🚶 rappel armé depuis Mon trajet', async () => {
  const w = await page.evaluate(`window.__sched = Date.now() + 15 * 60e3; window.__eff = __sched; ${leaveSetup(15)}`);
  await page.evaluate("__notes.length = 0; armLeave('Gare de St-Denis', 'Gare de St-Benoît', 'E1', __sched); 1");
  const r = await page.evaluate("[!!leaveArm, JSON.parse(localStorage.getItem('cj_leave')).line, __notes.filter(n => /Prépare-toi/.test(n)).length]");
  return (w >= 9 && w <= 12 && r[0] && r[1] === 'E1' && r[2] === 1) || JSON.stringify([w, r]);
});
await t('🚶 « Pars maintenant » au bon moment, retard réel compris', async () => {
  const r = await page.evaluate(`(() => { __notes.length = 0;
    const w = walkMin(distM(myPos.lat, myPos.lon, -20.879, 55.448));
    window.__eff = Date.now() + (w + 1) * 60e3;               // le car a pris du retard : il passe dans w+1 min
    const j0 = journeyRows; journeyRows = (A, B) => [{ route:{ s:'E1' }, sched: __sched, eff: __eff, real: __eff, arr: __eff + 40 * 60e3, rarr: null }];
    leaveTick(); leaveTick();
    return __notes.slice(); })()`);
  return (r.length === 1 && /Pars maintenant/.test(r[0]) && /à pied/.test(r[0])) || JSON.stringify(r);
});
await t('🚶 annuler le rappel (2e touche)', async () => {
  const r = await page.evaluate("armLeave('Gare de St-Denis', 'Gare de St-Benoît', 'E1', __sched); [leaveArm, localStorage.getItem('cj_leave')]");
  return (r[0] === null && r[1] === null) || JSON.stringify(r);
});

await t('📊 un trajet noté puis affiché dans Mon bilan', async () => {
  const r = await page.evaluate(`(() => {
    localStorage.removeItem('cj_rides'); rides = [];
    const real = Date.now; let T = real(); Date.now = () => T;
    myPos = { lat: -20.879, lon: 55.448 }; bilanStart({ route:{ s:'E1' }, delay: 0 }, 'Gare de St-Denis');
    for (let i = 1; i <= 20; i++){ T += 60e3; myPos = { lat: -20.879 - i * 0.002, lon: 55.448 + i * 0.006 }; bilanTick({ delay: 240 }); }
    bilanEnd('Gare de St-Benoît'); Date.now = real;
    setView('trip'); const c = document.querySelector('#bilanCard'); c.open = true; renderBilan();
    return [rides.length, rides[0] && rides[0].km, document.querySelector('#bilanBody').innerText, document.querySelector('#bilanSum').textContent];
  })()`);
  return (r[0] === 1 && r[1] > 10 && /1\s*trajet/.test(r[2]) && /CO₂ évité/.test(r[2]) && /1 trajet en retard/.test(r[2]) && /1 trajet en/.test(r[3])) || JSON.stringify(r);
});
await t('📊 trajet de moins de 2 min ignoré (fausse détection)', async () => {
  const n = await page.evaluate(`(() => { myPos = { lat: -20.879, lon: 55.448 }; bilanStart({ route:{ s:'E1' }, delay: 0 }, 'X'); bilanEnd('Y'); return rides.length; })()`);
  return n === 1 || n;
});

await t('✈️ vol dans 5 h : le car pour arriver 2 h avant (+ plus prudent)', async () => {
  const r = await page.evaluate(`(() => { ${AIR}
    const now = Date.now(), row = (m, d) => ({ route:{ s:'Z' + m, c:'F6BE00', t:'222222' }, sched: now + m * 60e3, eff: now + m * 60e3, real: null, arr: now + (m + d) * 60e3, rarr: null });
    tripBoard.data = Object.assign(tripBoard.data || {}, { A: [], R: [] });
    journeyRows = (A, B) => /roport/.test(B.name) ? [row(60, 40), row(120, 40), row(210, 40)] : [];
    STATSW = {}; STATS = {};
    avion = { mode:'dep', at: now + 5 * 3600e3, me:'Gare de St-Denis', lead:120 }; saveAvion();
    setView('avion'); document.querySelector('#avionCard').open = true; renderAvion();
    return [document.querySelector('#avRes').innerText, document.querySelector('#avionSum').textContent];
  })()`);
  return (/Z120/.test(r[0]) && /Plus prudent : le Z60/.test(r[0]) && !/Z210 de/.test(r[0]) && /🛫 vol/.test(r[1])) || JSON.stringify(r);
});
await t('✈️ j’atterris : premier car 30 min après', async () => {
  const r = await page.evaluate(`(() => { const now = Date.now(), row = m => ({ route:{ s:'Z' + m }, sched: now + m * 60e3, eff: now + m * 60e3, real: null, arr: now + (m + 40) * 60e3, rarr: null });
    journeyRows = (A, B) => /roport/.test(A.name) ? [row(20), row(50), row(80)] : [];
    avion = { mode:'arr', at: now, me:'Gare de St-Denis', lead:30 }; renderAvion();
    return document.querySelector('#avRes').innerText; })()`);
  return (/Z50/.test(r) && /Sinon : le Z80/.test(r)) || r;
});
await t('✈️ le bouton 🔔 arme « pars maintenant »', async () => {
  const r = await page.evaluate(`(() => { document.querySelector('#avRes [data-leave]').click(); return leaveArm && leaveArm.line; })()`);
  await page.evaluate("leaveArm = null; saveLeave(); 1");
  return r === 'Z50' || r;
});
await t('✈️ lien depuis Roland Garros Live (?vol=…&depart=…)', async () => {
  const p2 = await ctx.newPage();
  await p2.goto(BASE + '/_test.html?vol=uu975&depart=2030-01-15T15:30');
  await p2.waitForTimeout(3500);
  const r = await p2.evaluate("[avion && avion.vol, avion && avion.mode, view, document.querySelector('#avionCard').open, location.search]");
  await p2.close();
  return (r[0] === 'UU975' && r[1] === 'dep' && r[2] === 'avion' && r[3] && r[4] === '') || JSON.stringify(r);
});
await t('✈️ onglet Avions à côté de Trafic, avec les arrivées et départs', async () => {
  const r = await page.evaluate(`(async () => { flAt = 0; await loadFlights(true); setView('avion');
    const tabs = [...document.querySelectorAll('.tab')].map(x => x.dataset.view).join(',') + '|' + [...document.querySelectorAll('#view-avion .subtab')].map(x => x.dataset.goto).join(',')
      + '|' + document.querySelector('.tab.on').dataset.view;
    flDir = 'arr'; renderFlights(); const a = document.querySelector('#flBody').innerText;
    flDir = 'dep'; renderFlights(); const d = document.querySelector('#flBody').innerText;
    return [tabs, a, d]; })()`);
  return (r[0] === 'map,trip,board,trafic|trafic,avion|trafic' && /UU975/.test(r[1]) && /Maurice/.test(r[1]) && /UU976/.test(r[2]) && /Annulé/.test(r[2])) || JSON.stringify(r);
});
await t('🟧 girouette : avions qui arrivent / décollent / posés / annulés, et se coupe', async () => {
  const r = await page.evaluate(`(() => { hideStrip(true); giroOn = true; renderGiro();
    const on = [document.querySelector('#giro').hidden, document.querySelector('#giroTape').textContent];
    const m = flightMsgs(Date.now()).join(' | ');
    giroOn = false; renderGiro(); const off = document.querySelector('#giro').hidden; giroOn = true; renderGiro();
    return [on[0], m, off]; })()`);
  return (r[0] === false && /UU975 de Paris-Orly atterrit dans 1[12] min/.test(r[1]) && /AF652 de Paris-CDG s’est posé/.test(r[1])
    && /SS940 pour Paris-Orly a décollé/.test(r[1]) && /UU976 pour Paris-Orly : embarquement/.test(r[1]) && /Vol MD123 pour Antananarivo annulé/.test(r[1])
    && !/MK234/.test(r[1]) && r[2] === true) || JSON.stringify(r);
});
await t('✈️ 🚌 sur un vol : remplit « Prendre l’avion » ; retard de mon vol → heure recalculée + alerte', async () => {
  const r = await page.evaluate(`(() => { flDir = 'arr'; renderFlights();
    const i = flights.arr.findIndex(f => f.n === 'MK234');
    document.querySelector('[data-fl="arr|' + i + '"]').click();
    const a1 = [avion.mode, avion.vol, Math.round((avion.at - flights.arr[i].ts) / 60e3), document.querySelector('#avionCard').open];
    let got = ''; const n0 = notify; notify = (t, b) => { got = t; };
    flights.arr[i] = Object.assign({}, flights.arr[i], { hr: '', ts: flights.arr[i].ts + 70 * 60e3 }); followMyFlight();
    notify = n0;
    return [a1, Math.round((avion.at - flights.arr[i].ts) / 60e3), got]; })()`);
  return (r[0][0] === 'arr' && r[0][1] === 'MK234' && r[0][2] === 40 && r[0][3] && r[1] === 0 && /MK234 de Maurice : nouvel horaire/.test(r[2])) || JSON.stringify(r);
});
await t('🚌 les alertes des cars passent dans la girouette (une à la fois, touche = suivante)', async () => {
  const r = await page.evaluate(`(() => { hideStrip(true); setView('map');
    notify('🚌 E1 dans 5 min', 'Gare de St-Denis', 'bus', { force:true }); notify('🛎️ Descends au prochain arrêt !', 'Gare de St-Denis', 'warn', { force:true });
    const g = document.querySelector('#giro'), a = [g.hidden, g.className, document.querySelector('#giroTape').textContent, document.querySelector('#giroN').textContent,
      getComputedStyle(document.querySelector('#alStrip')).width];
    g.click(); const b = [g.className, document.querySelector('#giroTape').textContent];
    g.click(); const c = [g.className, view];
    return [a, b, c]; })()`);
  return (r[0][0] === false && /giro-bus/.test(r[0][1]) && /E1 dans 5 min · Gare de St-Denis/.test(r[0][2]) && r[0][3] === '+1' && r[0][4] === '1px'
    && /giro-warn/.test(r[1][0]) && /Descends au prochain arrêt/.test(r[1][1]) && /giro-air/.test(r[2][0]) && r[2][1] !== 'avion') || JSON.stringify(r);
});
await t('🗣️ texte dit à voix haute : sans émojis, St- → Saint-, 14:05 → 14 h 05, E1 → E 1', async () => {
  const r = await page.evaluate(`speechify('🚌 ZE1 → St-Benoît · arrive à Ste-Marie dans 5 min, à 14:05 (retard 1 min). Vol UU975 à 14:00')`);
  return r === 'Z E 1 direction Saint-Benoît, arrive à Sainte-Marie dans 5 minutes, à 14 h 05, retard 1 minute. Vol U U 9 7 5 à 14 heures' || r;
});
await t('🗣️ annonce façon gare pour un car qui arrive, carillon puis voix française', async () => {
  const r = await page.evaluate(`(async () => {
    const said = [], a0 = announce; let spoke = null;
    announce = (k, t) => said.push(k + '|' + t);
    alertCfg.sound = true; alertCfg.voice = true; alertCfg.muteUntil = 0;
    notify('🚌 E1 → St-Benoît', 'Arrive à Gare de St-Denis dans 5 min.', undefined, { say: sayBus({ route:{ s:'E1' }, dest:'St-Benoît' }, 'Gare de St-Denis', 'arrivera à l’arrêt Gare de St-Denis dans 5 minutes', 3) });
    notify('🛎️ Descends au prochain arrêt !', 'Gare de St-Denis : appuie sur le bouton.', 'warn');
    alertCfg.voice = false; notify('🚌 test', 'sans voix'); alertCfg.voice = true;
    announce = a0; hideStrip(true);
    // le vrai moteur : carillon puis speechSynthesis.speak
    const sp0 = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { spoke = [u.text, u.lang, u.rate]; };
    sayQ.length = 0; saying = false; announce('bus', 'Bonjour'); await new Promise(ok => setTimeout(ok, 2600));
    speechSynthesis.speak = sp0;
    return [said, spoke]; })()`);
  const [said, spoke] = r;
  return (said.length === 2 && said[0] === 'bus|Votre attention s’il vous plaît. Le car E 1, à destination de Saint-Benoît, arrivera à l’arrêt Gare de Saint-Denis dans 5 minutes, avec un retard d’environ 3 minutes.'
    && /^warn\|Descends au prochain arrêt ! Gare de Saint-Denis : appuie/.test(said[1]) && spoke && spoke[0] === 'Bonjour' && /^fr/.test(spoke[1])) || JSON.stringify(r);
});
await t('🗣️ avions : rien à l’ouverture, puis une annonce par nouvel événement', async () => {
  const r = await page.evaluate(`(() => {
    const said = [], a0 = announce; announce = (k, t) => said.push(k + '|' + t);
    Object.keys(planeSaid).forEach(k => delete planeSaid[k]); planeFirst = true; airVoice = true;
    announcePlanes(); const n0 = said.length;
    const i = flights.dep.findIndex(f => f.n === 'UU976');
    flights.dep[i] = Object.assign({}, flights.dep[i], { e: 'termine', st: 'Décollé', ts: Date.now() - 60e3, hr: '' });
    announcePlanes(); announcePlanes();
    announce = a0; return [n0, said]; })()`);
  return (r[0] === 0 && r[1].length === 1 && r[1][0] === 'air|Le vol U U 9 7 6 à destination de Paris-Orly vient de décoller.') || JSON.stringify(r);
});
await t('🔌 chargeur branché → écran gardé allumé (Android), ?charge=1 (raccourci iPhone), réglage coupé → non', async () => {
  const r = await page.evaluate(`(async () => {
    let asked = 0; const wl = navigator.wakeLock;
    Object.defineProperty(navigator, 'wakeLock', { configurable:true, value: { request: async () => { asked++; return { released:false, addEventListener(){}, release: async () => {} }; } } });
    const c0 = charging, f0 = chargeFlag, w0 = wakeLock; wakeLock = null; alertCfg.wake = false; alertCfg.chargeAwake = true;
    const out = [];
    charging = true; await applyWake(); out.push(chargeAwake(), !document.querySelector('#chargeIco').hidden, asked);
    charging = false; await applyWake(); out.push(chargeAwake(), document.querySelector('#chargeIco').hidden);
    charging = null; chargeFlag = true; out.push(chargeAwake());
    alertCfg.chargeAwake = false; out.push(chargeAwake());
    alertCfg.chargeAwake = true; charging = c0; chargeFlag = f0; wakeLock = w0; await applyWake();
    Object.defineProperty(navigator, 'wakeLock', { configurable:true, value: wl });
    return out; })()`);
  return JSON.stringify(r) === '[true,true,1,false,true,true,false]' || JSON.stringify(r);
});
await t('📡 suivi en direct : code de 8 caractères, journal envoyé par paquets, pas deux fois la même ligne', async () => {
  const r = await page.evaluate(`(async () => {
    window.__live = []; const box = document.querySelector('#liveOn');
    box.checked = true; box.dispatchEvent(new Event('change'));
    diag('car', { vitesse: 30, dedans: 'X' }); diag('alerte', { titre: 'test' });
    await liveFlush(); const a = __live.length;
    await liveFlush(); const b = __live.length;
    diag('gps', { lat: 1, lon: 2 }); await liveFlush(); const c = __live.length;
    const code = live.code, txt = document.querySelector('#liveTxt').textContent;
    box.checked = false; box.dispatchEvent(new Event('change')); await new Promise(ok => setTimeout(ok, 50));
    return [code, window.__liveCode, a, b, c, /En direct · code/.test(txt), live]; })()`);
  return (/^[A-Z2-9]{8}$/.test(r[0]) && r[1] === r[0] && r[2] >= 3 && r[3] === r[2] && r[4] === r[2] + 1 && r[5] && r[6] === null) || JSON.stringify(r);
});
await t('aucune erreur JavaScript', async () => errs.length === 0 || errs.join(' / '));
await browser.close();
if (fails.length){ console.log(`✗ ${fails.length} problème(s)`); process.exit(1); }
console.log('✓ Arrivée réaliste, pars maintenant, bilan et avion : tout est bon.');
