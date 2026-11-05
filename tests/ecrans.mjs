// Car Jaune Live — test : l'appli s'adapte à chaque écran (téléphones, à l'horizontale, tablettes, ordinateurs)
// Vérifie : pas de défilement de côté, en-tête qui tient sur une ligne, boutons de carte visibles.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const DEV = [['petit téléphone', 320, 568, 1], ['iPhone', 390, 844, 1], ['grand téléphone', 430, 932, 1], ['téléphone horizontal', 844, 390, 1],
  ['grand téléphone horizontal', 932, 430, 1], ['iPad', 768, 1024, 1], ['tablette horizontale', 1024, 768, 1], ['iPad horizontal', 1180, 820, 1],
  ['ordinateur', 1440, 900, 0], ['grand écran', 1920, 1080, 0]];
const b = await chromium.launch();
for (const [n, w, h, touch] of DEV){
  const ctx = await b.newContext({ viewport:{ width:w, height:h }, hasTouch:!!touch });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/_test.html'); await p.waitForTimeout(1800);
  for (const v of ['map', 'trip', 'board', 'fiches', 'trafic']){
    await p.evaluate(`setView('${v}'); 1`); await p.waitForTimeout(250);
    const r = await p.evaluate(`(() => {
      const de = document.documentElement, top = document.querySelector('.top-in');
      const tabs = document.querySelector('.tabs'), mobile = isMobile();
      const tabsCut = !mobile && tabs.scrollWidth > tabs.clientWidth + 2;
      const hdrCut = top.scrollWidth > top.clientWidth + 2;
      return [de.scrollWidth > innerWidth + 1, tabsCut, hdrCut];
    })()`);
    if (r[0]) fails.push(`${n} (${w}×${h}) · ${v} : la page déborde sur le côté`);
    if (r[1]) fails.push(`${n} (${w}×${h}) · ${v} : onglets coupés dans l’en-tête`);
    if (r[2]) fails.push(`${n} (${w}×${h}) · ${v} : en-tête trop large`);
  }
  await p.evaluate("setView('map'); 1"); await p.waitForTimeout(300);
  const btns = await p.evaluate(`[...document.querySelectorAll('.map-ctl button')].filter(x => { const r = x.getBoundingClientRect(); return r.width && r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; }).length`);
  if (btns < 5) fails.push(`${n} (${w}×${h}) : boutons de la carte hors de l’écran (${btns}/5)`);
  errs.forEach(e => fails.push(`${n} : erreur JS : ${e}`));
  console.log('✓ ' + n + ` (${w}×${h})`);
  await ctx.close();
}
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Tous les écrans : tout est bon.');
