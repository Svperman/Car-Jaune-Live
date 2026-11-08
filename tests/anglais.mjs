// Car Jaune Live — test de la version anglaise (téléphone réglé en anglais) et du français par défaut.
// Usage : node tests/anglais.mjs (après smoke.mjs, dossier servi sur :8765)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const t = async (label, fn) => {
  try { const r = await fn(); if (r === true) console.log('✓ ' + label); else { fails.push(label); console.log('✗ ' + label + ' : ' + r); } }
  catch (e) { fails.push(label); console.log('✗ ' + label + ' : ' + e.message.split('\n')[0]); }
};
const browser = await chromium.launch();
const open = async (locale, q = '') => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/_test.html' + q); await page.waitForTimeout(2500);
  return { ctx, page, errs };
};
await t('téléphone en anglais : onglets et titres en anglais', async () => {
  const { ctx, page, errs } = await open('en-US', '?user=1');
  const r = await page.evaluate(`[LANG, document.documentElement.lang, [...document.querySelectorAll('.tab .tl')].map(e => e.textContent.trim()).join('|'),
    (setView('board'), document.querySelector('#view-board, [data-sec=board], section.on h1, h1') || {}).textContent]`);
  await ctx.close();
  return (r[0] === 'en' && r[1] === 'en' && /Map/.test(r[2]) && /Trip/.test(r[2]) && /Times/.test(r[2]) && !errs.length) || JSON.stringify([r, errs]);
});
await t('les alertes partent en anglais', async () => {
  const { ctx, page } = await open('en-GB');
  const r = await page.evaluate(`(() => { let got = ''; const s0 = showStrip; showStrip = (a, b) => { got = a + ' | ' + b; return s0(a, b); };
    notify('🛎️ Descends au prochain arrêt !', 'Gare de St-Denis : appuie sur le bouton d’arrêt du car.', 'warn', { force:true }); return got; })()`);
  await ctx.close();
  return (/Get off at the next stop!/.test(r) && /Gare de St-Denis/.test(r) && /press the bus stop button/.test(r)) || r;
});
await t('noms d’arrêts intacts (« Gare de St-Denis », « Inverser » non découpé)', async () => {
  const { ctx, page } = await open('en-US');
  const r = await page.evaluate("[tr('Gare de St-Denis'), tr('Retard 5 min'), tr('dans 3 arrêts'), tr('Ste-Marie Duparc')]");
  await ctx.close();
  return (r[0] === 'Gare de St-Denis' && r[1] === '5 min late' && r[2] === 'in 3 stops' && r[3] === 'Ste-Marie Duparc') || JSON.stringify(r);
});
await t('téléphone en français : rien ne change', async () => {
  const { ctx, page } = await open('fr-FR');
  const r = await page.evaluate("[LANG, [...document.querySelectorAll('.tab .tl')].map(e => e.textContent.trim()).join('|'), tr('Retard 5 min')]");
  await ctx.close();
  return (r[0] === 'fr' && /Carte/.test(r[1]) && r[2] === 'Retard 5 min') || JSON.stringify(r);
});
await t('réglage Langue : English forcé même en français', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await ctx.addInitScript(() => { try { localStorage.setItem('cj_lang', 'en'); } catch(e){} });
  const page = await ctx.newPage(); await page.goto(BASE + '/_test.html'); await page.waitForTimeout(2500);
  const r = await page.evaluate("[LANG, document.querySelector('#langSel').value]");
  await ctx.close();
  return (r[0] === 'en' && r[1] === 'en') || JSON.stringify(r);
});
await browser.close();
if (fails.length){ console.log(`✗ ${fails.length} problème(s)`); process.exit(1); }
console.log('✓ Version anglaise : tout est bon.');
