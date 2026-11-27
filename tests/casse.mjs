// Car Jaune Live — « si j'étais un utilisateur qui voulait casser l'appli » : valeurs abîmées sur l'appareil,
// position absurde, données piégées, bouton retour après le Menu, clics en rafale.
// Usage : node tests/casse.mjs (après smoke.mjs, dossier servi sur :8765)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const browser = await chromium.launch();
async function t(label, pre, fn){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addInitScript(pre || (() => {}));
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  try {
    await page.goto(BASE + '/_test.html'); await page.waitForTimeout(2500);
    await page.evaluate("document.querySelector('#geoSheet').hidden = true; 1"); await page.waitForTimeout(500);
    const r = await fn(page);
    if (r === true && !errs.length) console.log('✓ ' + label);
    else { fails.push(label); console.log('✗ ' + label + ' : ' + (r === true ? '' : r) + (errs.length ? ' ERREURS ' + errs.join(' | ') : '')); }
  } catch(e){ fails.push(label); console.log('✗ ' + label + ' : ' + e.message.split('\n')[0]); }
  await ctx.close();
}

await t('valeurs abîmées sur l’appareil : l’appli démarre et le Menu s’ouvre', () => {
  localStorage.setItem('cj_rides', '"oops"'); localStorage.setItem('cj_tripfavs', '{"a":1}'); localStorage.setItem('cj_friends', '42');
  localStorage.setItem('cj_inbox', 'null'); localStorage.setItem('cj_urb', '[1,2]'); localStorage.setItem('cj_look', '"x"');
  localStorage.setItem('cj_ns_snap', 'n\'importe quoi'); localStorage.setItem('cj_ign', '{pas du json');
}, async p => {
  const r = await p.evaluate(`(() => { openMenu(); const n = document.querySelectorAll('#menuBox [data-mn]').length;
    return [n, Array.isArray(rides), Array.isArray(tripFavs), Array.isArray(urbOn) ? 'tableau' : typeof urbOn, ns.snap,
      getComputedStyle(document.querySelector('#nearSheet')).getPropertyValue('--nsh')]; })()`);
  return (r[0] >= 12 && r[1] && r[2] && r[3] === 'object' && r[4] === 'mid' && /^\d+px$/.test(r[5])) || JSON.stringify(r);
});

await t('position absurde (NaN) : on se rabat sur le centre de la carte', null, async p => {
  const r = await p.evaluate(`(async () => { myPos = { lat: NaN, lon: NaN }; myFixAt = Date.now(); await nsRefresh(true); return document.querySelector('#nsWhere').textContent; })()`);
  return /centre/.test(r) || r;
});

await t('noms piégés (HTML) : rien n’est exécuté ni inséré', null, async p => {
  const r = await p.evaluate(`(async () => { window.__x = 0;
    ns.rows = [{ key: 'a', route: { s: '<img src=x onerror=__x=1>', c: 'F00"><b', t: 'fff' }, dest: '<img src=x onerror=__x=2>', eff: Date.now() + 3e5, live: true,
      stop: '<script>__x=3<\\/script>', open: 'x', d: 50, net: '<i>N</i>' }];
    ns.at = Date.now(); ns.pos = { lat: 0, lon: 0, me: true }; nsRender(); await new Promise(r => setTimeout(r, 300));
    return [__x, document.querySelectorAll('#nsList img, #nsList script, #nsList i').length, /<img src=x/.test(document.querySelector('#nsList').textContent)]; })()`);
  return (r[0] === 0 && r[1] === 0 && r[2]) || JSON.stringify(r);   // le texte piégé s'affiche tel quel, sans devenir du HTML
});

await t('bouton retour après une tuile du Menu : revient à la carte en un seul appui', () => { window.__testBack = true; }, async p => {
  const out = [];
  for (const k of ['trip', 'board', 'simple', 'reglages']){
    await p.evaluate('openMenu(); 1'); await p.waitForTimeout(300);
    await p.evaluate(`document.querySelector('#menuBox [data-mn=${k}]').click(); 1`); await p.waitForTimeout(400);
    await p.evaluate('history.back(); 1'); await p.waitForTimeout(500);
    out.push(await p.evaluate("[view, history.state && history.state.cj, document.querySelector('#simpleOv').hidden, document.querySelector('#settingsModal').hidden].join('/')"));
  }
  return out.every(x => x === 'map/base/true/true') || out.join(' ; ');
});

await t('Menu ouvert/fermé 30 fois de suite, puis retour : le Menu se ferme, l’appli reste ouverte', () => { window.__testBack = true; }, async p => {
  await p.evaluate("for (let i = 0; i < 30; i++){ openMenu(); document.querySelector('#menuBox [data-mn=close]').click(); } 1"); await p.waitForTimeout(500);
  await p.evaluate('openMenu(); 1'); await p.waitForTimeout(300);
  await p.evaluate('history.back(); 1'); await p.waitForTimeout(500);
  const r = await p.evaluate("[location.pathname, document.querySelector('#menuOv').hidden, history.state && history.state.cj]");
  return (/_test/.test(r[0]) && r[1] && r[2] === 'base') || JSON.stringify(r);
});

await t('20 actualisations du panneau en même temps : pas de doublon', null, async p => {
  const r = await p.evaluate(`(async () => { myPos = { lat: -20.879, lon: 55.448 }; myFixAt = Date.now();
    await Promise.all(Array.from({ length: 20 }, () => nsRefresh(true))); await new Promise(r => setTimeout(r, 1500));
    const k = [...document.querySelectorAll('#nsList .ns-card')].map(c => c.getAttribute('aria-label')); return [k.length, new Set(k).size]; })()`);
  return (r[0] > 0 && r[0] === r[1]) || JSON.stringify(r);
});

await browser.close();
if (fails.length){ console.log(`✗ ${fails.length} problème(s)`); process.exit(1); }
console.log('✓ Casse-tout : l’appli tient bon');
