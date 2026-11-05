// Car Jaune Live — test de la détection « je suis dans ce car » (rejoue le trajet réel du 05/11 : T sur la route du Littoral)
// Simule : positions des cars en retard de 20 s, car qui roule en sens inverse, arrêts, descente.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const b = await chromium.launch();
const pg = await (await b.newContext({ viewport:{ width:390, height:844 } })).newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/_test.html'); await pg.waitForTimeout(2500);
await pg.evaluate("forceUntil = Date.now() + 3600e3; updateMode(); refresh(); 1"); await pg.waitForTimeout(1200);
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };

const r = await pg.evaluate(`(() => {
  // horloge simulée
  let T = Date.now(); const realNow = Date.now; Date.now = () => T;
  shareCfg.name = 'Samuel'; shareCfg.auto = true; shareCfg.on = false;
  const evs = [], notes = [];
  shareEvent = ev => evs.push(ev.k + (ev.stop ? '@' + ev.stop : ''));
  const n0 = notify; notify = (t, b, k, o) => { if (/Tu es dans le/.test(t)) notes.push(t); };
  const base = vehicles[0];
  const mk = (id, s, bearing) => Object.assign({}, base, { id, route: { s, c:'F6BE00', t:'222222', l:'' }, headsign: s === 'T' ? 'St-Pierre' : 'St-Denis', bearing, times: null, est: null });
  // route du Littoral vers l'ouest : on avance de 25 m/s (90 km/h)
  const lat0 = -20.8753, lon0 = 55.4354, mPerDegLon = 104000;
  const at = sec => [lat0 - sec * 2 / 111000, lon0 - sec * 25 / mPerDegLon];
  const busT = mk('T1', 'T', 265), busO = mk('O2', 'O2', 85);
  onBus = null; busCand = null; ride = { phase:'idle', stop:'', since:0, sent:{}, veh:'', info:null };
  const log = [];
  for (let s = 0; s <= 900; s++){
    T += 1000;
    // phase 1 (0-600 s) : dans le T, à 90 km/h ; phase 2 : descendu, je marche (1,2 m/s) pendant que le T repart
    const inBus = s < 600;
    const me = inBus ? at(s) : (() => { const p = at(600); return [p[0] + (s - 600) * 1.2 / 111000, p[1]]; })();
    myPos = { lat: me[0], lon: me[1], acc: 8, speed: inBus ? 25 : 1.2 };
    // le flux : position du T mise à jour toutes les 20 s (donc jusqu'à 20 s de retard = 500 m)
    if (s % 20 === 0){
      const ts = Math.floor(s / 20) * 20, p = at(ts + (s >= 600 ? (s - 600) * 0 + 0 : 0));
      const bp = s < 600 ? at(ts) : at(600 + (s - 600) * 1.0);         // après ma descente, le T continue
      Object.assign(busT, { lat: bp[0], lon: bp[1], age: 15e3 });
      // un O2 en sens inverse croise ma route vers 300 s
      const op = at(600 - s);                                               // il vient d'en face
      Object.assign(busO, { lat: op[0] + 0.0004, lon: op[1], age: 10e3 });
      vehicles = [busT, busO];
    }
    autoCheck(); detectMyBus(); rideTick();
    log.push(onBus || '-');
  }
  Date.now = realNow; notify = n0;
  const switches = log.filter((x, i) => i && x !== log[i - 1]).length;
  return { evs, notes, switches, inT: log.slice(5, 600).filter(x => x === 'T1').length, after: log[log.length - 1], wrong: log.filter(x => x === 'O2').length };
})()`);
console.log('    ', JSON.stringify(r));
await t('dans le T pendant tout le trajet (positions en retard de 20 s)', async () => r.inT >= 590 || `seulement ${r.inT}/595 s`);
await t('jamais « dans le O2 » qui roule en sens inverse', async () => r.wrong === 0 || `${r.wrong} s dans le O2`);
await t('une seule annonce « Tu es dans le T »', async () => r.notes.length === 1 || JSON.stringify(r.notes));
await t('un seul départ et une seule descente pour les proches (sans inventer l’arrêt)', async () => (!r.evs.includes('arrive@St-Pierre') && r.evs.filter(e => e.startsWith('depart')).length === 1 && r.evs.filter(e => e.startsWith('arrive')).length === 1) || JSON.stringify(r.evs));
await t('descente reconnue après être sorti du car', async () => r.after === '-' || 'toujours dans ' + r.after);
await t('pas de va-et-vient (2 changements maximum : monté, descendu)', async () => r.switches <= 2 || r.switches + ' changements');
errs.forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Détection du car : tout est bon.');
