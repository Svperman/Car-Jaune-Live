import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const pg = await b.newPage({ viewport:{width:390,height:844} });
const errs=[]; pg.on('pageerror', e=>errs.push(e.message));
await pg.goto('http://localhost:8765/_test.html'); await pg.waitForTimeout(3000);
const r = await pg.evaluate(async () => {
  const now = Date.now(), mid = midnightMs(now), sec = ms => Math.round((ms - mid)/1000);
  // E1 retour : St-Benoît (Z) → Duparc (B) → St-Denis (A), puis O1 St-Denis (A) → St-Pierre (P)
  S.trips.R1 = ['2','Gare de St-Denis','1', sec(now+5*60e3), sec(now+45*60e3), 'Z','A','SVC'];
  S.trips.O9 = ['9','Gare de St-Pierre','0', sec(now+52*60e3), sec(now+130*60e3), 'A','P','SVC'];
  const fake = { Z:[['R1',sec(now+5*60e3)]], B:[['R1',sec(now+20*60e3)]], A:[['R1',sec(now+45*60e3)],['O9',sec(now+52*60e3)]], P:[['O9',sec(now+130*60e3)]] };
  const real = call; window.call = (fn, ids) => fn === 'getStopBoard' ? Promise.resolve(JSON.stringify(Object.fromEntries(ids.map(i => [i, fake[i] || []])))) : real(fn, ids);
  trip.a = 'Sainte-Marie Duparc'; trip.b = 'Gare de St-Pierre'; trip.mode = 'aller';
  tripBoard = { key:'', data:null, loading:false }; transfer = { key:'', loading:false, done:false, hubs:[] };
  FICHE_DATA = {};
  setView('trip'); await new Promise(r => setTimeout(r, 2500));
  return { hubs: transfer.hubs.map(g => g.name), cartes: [...document.querySelectorAll('.tr-card')].map(c => c.innerText.replace(/\n/g, ' | ')) };
});
console.log(JSON.stringify(r, null, 1)); console.log('errors', errs);
await pg.screenshot({ path: '/tmp/claude-0/-home-claude/81d0d9f3-581d-5c3b-87e7-a662441dffcb/x.png' }).catch(()=>{});
await b.close();
