// Car Jaune Live — test « sans réseau » : bandeau, horaires gardés arrêt par arrêt, envois mis de côté
// Usage : node tests/horsligne.mjs  (après smoke.mjs qui crée _test.html ; dossier servi sur http://localhost:8765)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
writeFileSync('_off.html', readFileSync('_test.html', 'utf8').replace('<script src="tests/mock.js"></script>', '<script src="tests/mock.js"></script><script src="tests/fail.js"></script>'));
const fails = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.route(/ntfy\.sh/, r => r.fulfill({ status: 200, body: '{}' }));
await page.goto(BASE + '/_off.html');
await page.waitForTimeout(2500);
const shown = () => page.evaluate("getComputedStyle(document.querySelector('#offBar')).display !== 'none'");
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };

await t('avec réseau : pas de bandeau « Hors ligne » à l’écran', async () => (await shown()) === false || 'bandeau visible');
await t('pack : horaires de tous les arrêts gardés', async () => {
  await page.evaluate('offlinePack(true)');
  const r = await page.evaluate("[+localStorage.getItem('cj_pack_n'), Object.keys(S.stops).length, document.querySelector('#packTxt').textContent]");
  return (r[0] === r[1] && r[0] > 0 && /arrêts gardés/.test(r[2])) || JSON.stringify(r);
});
await t('coupure : bandeau « Hors ligne », un seul message', async () => {
  await page.evaluate("window.__fail = 'all'; 1");
  await ctx.setOffline(true);
  await page.waitForTimeout(300);
  await page.evaluate('refresh()'); await page.evaluate('busy = false; refresh()');
  const r = await page.evaluate("[!document.querySelector('#offBar').hidden, document.querySelector('#offBar').innerText, netDown]");
  return (r[0] && r[2] && /Hors ligne/.test(r[1])) || JSON.stringify(r);
});
await t('sans réseau : départs d’un arrêt jamais ouvert, reconstitués', async () => {
  const r = await page.evaluate(`(async () => { const ids = Object.keys(S.stops).slice(0, 3).reverse();   // combinaison jamais demandée
    const o = JSON.parse(await call('getStopBoard', ids)); return [Object.keys(o).length, Object.values(o).some(l => l.length)]; })()`);
  return (r[0] === 3 && r[1]) || JSON.stringify(r);
});
await t('sans réseau : signalement mis de côté', async () => {
  await page.evaluate(`(() => { const now = Date.now(); openReport(stopGroups[0].name, 'E1', now + 600e3);
    document.querySelector('#repBtns [data-rep="full"]').click(); })()`);
  await page.waitForTimeout(300);
  const r = await page.evaluate("[outbox.reps.length, document.querySelector('#offBar').innerText]");
  return (r[0] === 1 && /1 envoi en attente/.test(r[1])) || JSON.stringify(r);
});
await t('retour du réseau : bandeau caché, signalement envoyé', async () => {
  await page.evaluate("window.__fail = null; 1");
  await ctx.setOffline(false);
  await page.waitForTimeout(1500);
  const r = await page.evaluate("[document.querySelector('#offBar').hidden, outbox.reps.length, (window.__reps || []).length]");
  return (r[0] && !(await shown()) && r[1] === 0 && r[2] === 1) || JSON.stringify(r);
});
await page.screenshot({ path: 'test-horsligne.png' });
errs.forEach(e => fails.push('erreur JS : ' + e));
await browser.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Sans réseau : tout est bon.');
