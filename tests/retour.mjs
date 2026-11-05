// Car Jaune Live — test : bouton « retour » (Android) et réglages iPhone (pas de zoom sur les champs)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{ width:412, height:915 }, hasTouch:true, isMobile:true,
  userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
await ctx.addInitScript(() => { window.__testBack = true; });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/_test.html'); await p.waitForTimeout(2500);
await p.evaluate("document.querySelector('#geoSheet').hidden = true; 1");
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };
await t('retour ferme les réglages (sans quitter l’appli)', async () => {
  await p.click('#gearBtn'); await p.waitForTimeout(200);
  await p.goBack(); await p.waitForTimeout(300);
  const r = await p.evaluate("[document.querySelector('#settingsModal').hidden, location.pathname]");
  return (r[0] === true && /_test\.html/.test(r[1])) || JSON.stringify(r);
});
await t('retour depuis Horaires → revient à la carte', async () => {
  await p.click('.tab[data-view=board]'); await p.waitForTimeout(200);
  await p.goBack(); await p.waitForTimeout(300);
  return (await p.evaluate('view')) === 'map' || 'vue : ' + await p.evaluate('view');
});
await t('Horaires puis réglages : retour ferme les réglages, retour revient à la carte', async () => {
  await p.click('.tab[data-view=trip]'); await p.waitForTimeout(150);
  await p.click('#gearBtn'); await p.waitForTimeout(150);
  await p.goBack(); await p.waitForTimeout(250);
  const a = await p.evaluate("[document.querySelector('#settingsModal').hidden, view]");
  await p.goBack(); await p.waitForTimeout(250);
  const v = await p.evaluate('view');
  return (a[0] === true && a[1] === 'trip' && v === 'map') || JSON.stringify([a, v]);
});
await t('fermer avec ✕ puis retour : pas de double retour', async () => {
  await p.click('.tab[data-view=board]'); await p.waitForTimeout(150);
  await p.click('#gearBtn'); await p.waitForTimeout(150);
  await p.click('#setClose'); await p.waitForTimeout(300);
  const a = await p.evaluate('view');
  await p.goBack(); await p.waitForTimeout(250);
  const v = await p.evaluate('view');
  return (a === 'board' && v === 'map') || JSON.stringify([a, v]);
});
await t('champs en 16 px sur écran tactile (pas de zoom iPhone)', async () => {
  const r = await p.evaluate("[...document.querySelectorAll('input:not([type=checkbox]), select')].filter(e => e.offsetParent || true).map(e => parseFloat(getComputedStyle(e).fontSize)).filter(x => x < 16).length");
  return r === 0 || r + ' champ(s) trop petits';
});
errs.forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ iPhone / Android : tout est bon.');
