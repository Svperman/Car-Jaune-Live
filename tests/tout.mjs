// Car Jaune Live — test des améliorations du 8 novembre : trajet en direct, « tout va bien ? », suivi d'un proche,
// vue simple, porte à porte, trajets favoris, calendrier, autre jour, fréquentation, idées/bugs, tableau créateur, créole.
// Usage : node tests/tout.mjs (après smoke.mjs, dossier servi sur :8765)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const t = async (label, fn) => {
  try { const r = await fn(); if (r === true) console.log('✓ ' + label); else { fails.push(label); console.log('✗ ' + label + ' : ' + r); } }
  catch (e) { fails.push(label); console.log('✗ ' + label + ' : ' + e.message.split('\n')[0]); }
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/_test.html');
await page.waitForTimeout(2500);
await page.evaluate(`forceUntil = Date.now() + 3600e3; updateMode(); refresh(); document.querySelector('#geoSheet').hidden = true;
  window.__notes = []; const n0 = notify; notify = (t, b, k, o) => { __notes.push(t + ' | ' + b); return n0(t, b, k, o); }; 1`);
await page.waitForTimeout(1200);
const BUS = `(() => { const now = Date.now(), st = (id, sec) => ({ id, sec, lat: S.stops[id][1], lon: S.stops[id][2], s: 0 });
  const stops = [st('A', 0), st('B', 15 * 60), st('Z', 45 * 60)];
  const pts = stops.map(x => [x.lat, x.lon]), cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distM(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  stops.forEach((x, i) => x.s = cum[i]);
  tripGeomCache['T1'] = { line: { pts, cum, len: cum[cum.length - 1] }, rev: false, stops };
  const v = vehicles.find(x => x.id === 'bus1'); v.tripId = 'T1'; v.delay = 120; v.est = { next: 1, base: now - 5 * 60e3, delay: 120 };
  v.lat = stops[0].lat + (stops[1].lat - stops[0].lat) * .5; v.lon = stops[0].lon + (stops[1].lon - stops[0].lon) * .5;
  onBus = 'bus1'; return v; })()`;

await t('🗺️ trajet en direct : parcours gris + couleur, arrêts à venir avec heure', async () => {
  const r = await page.evaluate(`(() => { ${BUS}; setView('map'); liveState = { key:'', at:0 }; liveTick();
    const lines = [], tips = []; liveLayer.eachLayer(l => { if (l instanceof L.Polyline && !(l instanceof L.CircleMarker)) lines.push(l.options.color); else if (l.getTooltip && l.getTooltip()) tips.push(l.getTooltip().getContent()); });
    return [lines, tips]; })()`);
  return (r[0].length === 2 && r[0][0] === '#9aa3ad' && r[1].length === 3 && r[1].some(x => /St-Benoît · \d\d:\d\d/.test(x))) || JSON.stringify(r);
});
await t('🗺️ coupé quand on n’est plus dans un car', async () => {
  const n = await page.evaluate("onBus = null; liveTick(); let n = 0; liveLayer.eachLayer(() => n++); n");
  return n === 0 || n;
});
await t('✅ « Tout va bien ? » 20 min après l’heure prévue, puis SMS proposé', async () => {
  const r = await page.evaluate(`(() => { ${BUS};
    ride = { phase:'ride', stop:'Gare de St-Denis', since: Date.now() - 3600e3, sent:{}, veh:'bus1', info:{ to:'Gare de St-Benoît', until: Date.now() - 25 * 60e3 } };
    descPick = null; safe = { key:'', asked:0, ok:false, sms:false }; __notes.length = 0;
    tripReady = () => false; safeTick();
    const shown = !document.querySelector('#safeOv').hidden, txt = document.querySelector('#safeTxt').textContent;
    safe.asked = Date.now() - 6 * 60e3; window.__sms = null; const o0 = offerSms; offerSms = ev => { window.__sms = ev; }; safeTick(); offerSms = o0;
    return [shown, txt, __notes.filter(n => /Tout va bien/.test(n)).length, window.__sms && window.__sms.k, smsTextFr({ k:'check', to:'Gare de St-Benoît', eta: Date.now(), l:'E1' })]; })()`);
  await page.click('#safeOk');
  const closed = await page.evaluate("document.querySelector('#safeOv').hidden && safe.ok");
  return (r[0] && /St-Benoît/.test(r[1]) && r[2] === 1 && r[3] === 'check' && /Petit retard/.test(r[4]) && closed) || JSON.stringify([r, closed]);
});
await t('👁️ bandeau « tu suis » quand un proche est dans un car', async () => {
  const r = await page.evaluate(`(() => { onBus = null; ride.phase = 'idle';
    friends.push({ name:'Léa', code:'123456', last:{ t: Date.now(), lat:-20.9, lon:55.5, ride:{ id:'bus1', to:'Gare de St-Benoît', until: Date.now() + 20 * 60e3 }, bus:{ l:'E1', d:'Gare de St-Benoît' } } });
    setView('map'); followBar(); const b = document.querySelector('#followBar'); const r = [!b.hidden, b.innerText];
    friends.pop(); followBar(); return r.concat(b.hidden); })()`);
  return (r[0] && /Léa/.test(r[1]) && /arrivée/.test(r[1]) && r[2]) || JSON.stringify(r);
});
await t('🔎 vue simple : prochain car en grand', async () => {
  const r = await page.evaluate(`(async () => { setView('board'); await selectStop(findGroup('Gare de St-Denis')); tripReady = () => false;
    document.querySelector('[data-simple]').click(); const t = document.querySelector('#simpleBox').innerText; document.querySelector('#simpleClose').click();
    return [t, document.querySelector('#simpleOv').hidden]; })()`);
  return (/Gare de St-Denis/.test(r[0]) && /(min|À quai|\d\d:\d\d)/.test(r[0]) && r[1]) || JSON.stringify(r);
});
await t('🏠 porte à porte : marche + car + marche', async () => {
  const r = await page.evaluate(`(async () => { setView('trip'); document.querySelector('#d2dCard').open = true; renderD2d();
    const now = Date.now();
    journeyRows = (A, B) => A.name === 'Gare de St-Denis' && B.name === 'Gare de St-Benoît' ? [{ route:{ s:'E1', c:'F6BE00', t:'222222' }, sched: now + 30 * 60e3, eff: now + 30 * 60e3, real: null, arr: now + 80 * 60e3, rarr: null }] : [];
    d2d.from = { label:'Rue de Paris, Saint-Denis', lat: -20.8805, lon: 55.4495 }; d2d.to = { label:'Saint-Benoît centre', lat: -21.0345, lon: 55.7135 };
    tripBoard.data = Object.assign(tripBoard.data || {}, { A: [], Z: [], B: [] }); await d2dCompute();
    return document.querySelector('#d2dRes').innerText; })()`);
  return (/à pied jusqu’à Gare de St-Denis/.test(r) && /E1/.test(r) && /arrivée à ton adresse vers \d\d:\d\d/.test(r)) || r;
});
await t('🏠 « En faire Mon trajet »', async () => {
  const r = await page.evaluate("document.querySelector('[data-d2duse]').click(); [trip.a, trip.b]");
  return (r[0] === 'Gare de St-Denis' && r[1] === 'Gare de St-Benoît') || JSON.stringify(r);
});
await t('⭐ trajets favoris : garder, retrouver, retirer', async () => {
  const r = await page.evaluate(`(() => { localStorage.removeItem('cj_tripfavs'); tripFavs = []; renderTripFavs();
    document.querySelector('[data-tfadd]').click(); const saved = JSON.parse(localStorage.getItem('cj_tripfavs')).length;
    setTripPair('Gare de St-Pierre', 'Gare de St-Denis'); document.querySelector('#tripFavs [data-tf="0"]').click(); const back = [trip.a, trip.b].join('>');
    document.querySelector('[data-tfedit]').click(); document.querySelector('#tripFavs [data-tf="0"]').click(); document.querySelector('[data-tfedit]') && document.querySelector('[data-tfedit]').click();
    return [saved, back, tripFavs.length]; })()`);
  return (r[0] === 1 && r[1] === 'Gare de St-Denis>Gare de St-Benoît' && r[2] === 0) || JSON.stringify(r);
});
await t('📅 fichier calendrier (.ics avec rappel 15 min)', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.evaluate("addToCalendar('E1', Date.now() + 3600e3, Date.now() + 2 * 3600e3, 'Gare de St-Denis', 'Gare de St-Benoît'); 1")]);
  const fs = await import('node:fs'); const p = await dl.path(); const ics = fs.readFileSync(p, 'utf8');
  return (/BEGIN:VEVENT/.test(ics) && /TRIGGER:-PT15M/.test(ics) && /Car jaune E1/.test(ics) && /\.ics$/.test(dl.suggestedFilename())) || ics.slice(0, 200);
});
await t('🗓️ horaires d’un autre jour', async () => {
  const r = await page.evaluate(`(async () => { setView('board'); await selectStop(findGroup('Gare de St-Denis')); renderBoard();
    const inp = document.querySelector('#odayIn'); const d = new Date(Date.now() + 3 * 864e5); inp.value = d.toISOString().slice(0, 10);
    inp.dispatchEvent(new Event('change', { bubbles:true }));
    return [document.querySelector('#odayCard').hidden, document.querySelector('#odayBox').innerText]; })()`);
  return (!r[0] && /🗓️/.test(r[1]) && (/départ/.test(r[1]))) || JSON.stringify(r);
});
await t('🧍 « souvent plein » d’après les signalements', async () => {
  const r = await page.evaluate(`(async () => { const at = Date.now() + 3600e3, d = reuDate(at), sl = (d.wd <= 4 ? 'S' : d.wd === 5 ? 'A' : 'D') + d.h;
    window.__crowd = { E1: { [sl]: [5, 1] } }; await crowdLoad(); return [crowdNote('E1', at), crowdNote('O1', at)]; })()`);
  return (/souvent plein vers \d+ h/.test(r[0]) && r[1] === '') || JSON.stringify(r);
});
await t('💬 idée / bug envoyé au créateur', async () => {
  const r = await page.evaluate(`(async () => { openSettings(); document.querySelector('#fbText').value = 'Mettre la météo des gares'; document.querySelector('#fbKind').value = 'idee';
    await sendFeedback(); return [window.__fb && window.__fb[0].text, document.querySelector('#fbText').value]; })()`);
  return (r[0] === 'Mettre la météo des gares' && r[1] === '') || JSON.stringify(r);
});
await t('📈 tableau de bord du créateur', async () => {
  const r = await page.evaluate(`(async () => { document.querySelector('#crSec').open = true; await renderCreatorStats(); return document.querySelector('#crStats').textContent; })()`);
  return (/utilisateurs aujourd’hui/.test(r) && /Mettre la météo des gares/.test(r) && /TypeError/.test(r) && /iPhone 63 %/.test(r)) || r;
});
await t('📈 ouverture comptée une fois par jour (anonyme)', async () => {
  const p2 = await ctx.newPage(); await p2.goto(BASE + '/_test.html?x=1'); await p2.waitForTimeout(500);
  // dans les tests, IN_GAS : pas de compteur (comme dans Apps Script) — on vérifie juste l'identifiant anonyme
  const r = await p2.evaluate("[DEV_ID.length >= 8, /^(ios|android|pc)$/.test(DEV_OS)]"); await p2.close();
  return (r[0] && r[1]) || JSON.stringify(r);
});
await t('🇷🇪 créole : onglets et alertes', async () => {
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c2.addInitScript(() => { try { localStorage.setItem('cj_lang', 'rcf'); } catch(e){} });
  const p2 = await c2.newPage(); await p2.goto(BASE + '/_test.html'); await p2.waitForTimeout(2000);
  const r = await p2.evaluate("[LANG, [...document.querySelectorAll('.tab .tl')].map(e => e.textContent.trim()).join('|'), tr('Descends au prochain arrêt !'), tr('Gare de St-Denis')]");
  await c2.close();
  return (r[0] === 'rcf' && /Kart/.test(r[1]) && /Lèr/.test(r[1]) && r[2] === 'Désann o prosin arè !' && r[3] === 'Gare de St-Denis') || JSON.stringify(r);
});
await t('aucune erreur JavaScript', async () => errs.length === 0 || errs.join(' / '));
await browser.close();
if (fails.length){ console.log(`✗ ${fails.length} problème(s)`); process.exit(1); }
console.log('✓ Toutes les nouveautés : tout est bon.');
