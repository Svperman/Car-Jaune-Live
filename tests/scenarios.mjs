// Car Jaune Live — scénarios de la vraie vie : serveur en panne, hors ligne, la nuit, tous les réglages, saisies bizarres…
// Usage : node tests/smoke.mjs (crée _test.html) puis node tests/scenarios.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const html = readFileSync('_test.html', 'utf8').replace('<script src="tests/mock.js"></script>', '<script src="tests/mock.js"></script><script src="tests/fail.js"></script>');
writeFileSync('_bug.html', html);
const SHOT = process.env.SHOT || 'test-scenario-';
const b = await chromium.launch();
const report = [];
async function scenario(name, fn, opts = {}){
  const ctx = await b.newContext({ viewport: opts.vp || { width:390, height:844 }, ...(opts.ctx || {}) });
  if (opts.init) await ctx.addInitScript(opts.init);
  await ctx.route('https://ntfy.sh/**', r => r.fulfill({ status:200, body:'', headers:{'Access-Control-Allow-Origin':'*'} }));
  await ctx.route('https://geo.api.gouv.fr/**', r => r.fulfill({ status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body: JSON.stringify([{ nom:'Saint-Denis', contour:{ type:'Polygon', coordinates:[[[55.40,-20.95],[55.56,-20.95],[55.56,-20.86],[55.40,-20.86],[55.40,-20.95]]] } }]) }));
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|ERR_|status of 4|status of 5/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  let note = '';
  try { note = (await fn(pg, ctx)) || ''; } catch(e){ errs.push('SCÉNARIO: ' + e.message.split('\n')[0]); }
  await pg.screenshot({ path: SHOT + name.replace(/\W+/g, '_') + '.png' }).catch(() => {});
  report.push(`${errs.length ? '✗' : '✓'} ${name}${note ? ' — ' + note : ''}${errs.length ? '\n     ' + [...new Set(errs)].join('\n     ') : ''}`);
  await ctx.close();
}
const go = async (pg, url = '/_bug.html') => { await pg.goto('http://localhost:8765' + url); await pg.waitForTimeout(3000); };

await scenario('serveur injoignable au 1er lancement', async pg => {
  await go(pg); await pg.waitForTimeout(1500);
  for (const v of ['map','trip','board','fiches','trafic']) { await pg.click(`.tab[data-view=${v}]`); await pg.waitForTimeout(300); }
  await pg.click('#gearBtn'); await pg.waitForTimeout(300); await pg.click('#setClose');
  await pg.evaluate('openNext(); 1'); await pg.waitForTimeout(300);
  return 'toast: ' + (await pg.evaluate("$('#toast').hidden ? '-' : $('#toast').textContent")).slice(0, 80);
}, { init: () => { window.__fail = 'all'; } });

await scenario('temps réel en panne seulement', async pg => {
  await go(pg); await pg.evaluate('forceUntil = Date.now()+3600e3; updateMode(); refresh(); 1'); await pg.waitForTimeout(1500);
  await pg.click('.tab[data-view=board]'); await pg.evaluate("selectStop(stopGroups.find(g=>g.ids.includes('A'))); 1"); await pg.waitForTimeout(800);
  return (await pg.evaluate("$('#boardCard').innerText")).split('\n').slice(0, 3).join(' | ');
}, { init: () => { window.__fail = ['getRealtime']; } });

await scenario('hors ligne avec cache (2e ouverture)', async (pg, ctx) => {
  await go(pg); await pg.waitForTimeout(500);
  await pg.evaluate("window.__fail = 'all'; 1");
  await pg.reload(); await pg.evaluate("window.__fail = 'all'; 1"); await pg.waitForTimeout(3000);
  return 'lignes chargées : ' + await pg.evaluate("Object.keys(S.routes || {}).length");
}, { init: () => { if (sessionStorage.getItem('x')) window.__fail = 'all'; sessionStorage.setItem('x', 1); } });

await scenario('la nuit (réseau fermé)', async pg => {
  await go(pg);
  for (const v of ['map','trip','board','trafic']) { await pg.click(`.tab[data-view=${v}]`); await pg.waitForTimeout(300); }
  return 'mode : ' + await pg.evaluate('mode');
}, { ctx: {}, init: () => { const real = Date.now; const off = (new Date(real()).setUTCHours(19, 30, 0, 0)) - real(); /* 23h30 à La Réunion */ Date.now = () => real() + off; } });

await scenario('premier lancement appli installée sans serveur', async pg => {
  await pg.goto('http://localhost:8765/index.html'); await pg.waitForTimeout(2500);
  return 'écran : ' + (await pg.evaluate("document.querySelector('.modal:not([hidden]) h2') ? document.querySelector('.modal:not([hidden]) h2').textContent : 'aucun'"));
});

await scenario('tous les réglages activés puis réouverture', async pg => {
  await go(pg); await pg.evaluate('forceUntil = Date.now()+3600e3; updateMode(); refresh(); 1'); await pg.waitForTimeout(1200);
  await pg.evaluate("selectStop(stopGroups.find(g=>g.ids.includes('A'))); 1"); await pg.waitForTimeout(500);
  await pg.click('#gearBtn'); await pg.waitForTimeout(300);
  await pg.fill('#shName', 'Samuel'); await pg.press('#shName', 'Tab');
  for (const id of ['cityOn','shOn','pushOn','diagOn','cityEnter','cityLeave','alFollow','alWake']) { await pg.click(`#${id} + span`); await pg.waitForTimeout(250); }
  await pg.selectOption('#themeSel', 'dark'); await pg.selectOption('#textSel', 'huge'); await pg.selectOption('#citySector', '2000'); await pg.selectOption('#alLead', '10');
  await pg.click('[data-pause="60"]'); await pg.waitForTimeout(200); await pg.click('#pauseOff'); await pg.waitForTimeout(200);
  await pg.click('#setClose');
  await pg.reload(); await pg.waitForTimeout(4000);
  await pg.evaluate('forceUntil = Date.now()+3600e3; updateMode(); refresh(); 1'); await pg.waitForTimeout(1500);
  for (const v of ['map','trip','board','fiches','trafic','map']) { await pg.click(`.tab[data-view=${v}]`); await pg.waitForTimeout(300); }
  await pg.click('#bellBtn'); await pg.waitForTimeout(200); await pg.click('#bellBtn');
  return `réglages gardés : partage=${await pg.evaluate('shareCfg.on')} ville=${await pg.evaluate('cityCfg.on')} thème=${await pg.evaluate("document.documentElement.classList.contains('dark')")} délai=${await pg.evaluate('alertCfg.lead')}`;
}, { ctx: { geolocation:{ latitude:-20.879, longitude:55.448, accuracy:20 }, permissions:['geolocation'] } });

await scenario('Mon trajet : gares inconnues, identiques, inversées', async pg => {
  await go(pg);
  await pg.click('.tab[data-view=trip]');
  await pg.fill('#tripA', 'Gare imaginaire'); await pg.press('#tripA', 'Tab'); await pg.fill('#tripB', 'Gare de St-Benoît'); await pg.press('#tripB', 'Tab'); await pg.waitForTimeout(800);
  await pg.fill('#tripA', 'Gare de St-Benoît'); await pg.press('#tripA', 'Tab'); await pg.waitForTimeout(500);
  await pg.fill('#tripA', 'Gare de St-Denis'); await pg.press('#tripA', 'Tab'); await pg.waitForTimeout(800);
  await pg.click('#tripSwap'); await pg.waitForTimeout(800);
  await pg.click('#tripMode button[data-m=retour]'); await pg.waitForTimeout(500);
  await pg.click('#tripAlert').catch(() => {}); await pg.waitForTimeout(400);
  await pg.evaluate('openNext(); 1'); await pg.waitForTimeout(400);
  return (await pg.evaluate("$('#nextBody').innerText")).split('\n').slice(0, 2).join(' | ');
});

await scenario('recherche d’arrêt : vide, accents, inconnu', async pg => {
  await go(pg); await pg.click('.tab[data-view=board]');
  for (const q of ['', 'é', 'gare de st denis', 'zzzz', '<img src=x onerror=alert(1)>']) { await pg.fill('#stopInput', q); await pg.waitForTimeout(150); await pg.press('#stopInput', 'Enter'); await pg.waitForTimeout(250); }
  await pg.click('#favBtn').catch(() => {});
  return 'ok';
});

await scenario('ordinateur + mode sombre + grand texte', async pg => {
  await go(pg); await pg.evaluate("look.theme='dark'; look.text='big'; saveLook(); forceUntil = Date.now()+3600e3; updateMode(); refresh(); 1"); await pg.waitForTimeout(1200);
  for (const v of ['trip','board','fiches','trafic','map']) { await pg.click(`.tab[data-view=${v}]`); await pg.waitForTimeout(300); }
  await pg.click('#btnList'); await pg.click('#btnTraffic'); await pg.click('#btnFs'); await pg.click('#btnFit'); await pg.waitForTimeout(400);
  return 'ok';
}, { vp: { width:1280, height:800 } });

await scenario('lien d’un proche + puce + suppression', async pg => {
  await go(pg, '/_bug.html#proche=L%C3%A9a&code=123456'); await pg.waitForTimeout(1000);
  await pg.click('.fr-chip').catch(() => {}); await pg.waitForTimeout(400);
  await pg.click('#gearBtn'); await pg.click('.set-nav [data-sec=sec-proches]'); await pg.waitForTimeout(500);
  await pg.click('[data-frdel="0"]').catch(() => {}); await pg.waitForTimeout(300);
  return 'proches : ' + await pg.evaluate('friends.length');
});

console.log(report.join('\n'));
await b.close();
if (report.some(r => r.startsWith('✗'))) process.exit(1);
