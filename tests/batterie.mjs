// Car Jaune Live — test économie de batterie : un seul GPS à la fois, approximatif quand on ne bouge pas,
// coupé quand l'appli est cachée. Usage : node tests/batterie.mjs (après smoke.mjs, dossier servi sur :8765)
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
// faux GPS : on compte les suivis ouverts et leur précision
await ctx.addInitScript(() => {
  const watches = new Map(); let n = 0;
  window.__gps = watches;
  const fix = () => ({ coords: { latitude: -20.879, longitude: 55.448, accuracy: 15, speed: 0, heading: null }, timestamp: Date.now() });
  Object.defineProperty(navigator, 'geolocation', { value: {
    watchPosition(ok, err, opts){ const id = ++n; watches.set(id, { hi: !!(opts && opts.enableHighAccuracy) }); setTimeout(() => watches.has(id) && ok(fix()), 50); return id; },
    clearWatch(id){ watches.delete(id); },
    getCurrentPosition(ok){ setTimeout(() => ok(fix()), 50); }
  }, configurable: true });
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto(BASE + '/_test.html');
await page.waitForTimeout(2500);
const gps = () => page.evaluate('[...__gps.values()].map(w => w.hi ? "précis" : "approx")');

await t('📍 Ma position : un GPS précis au départ', async () => {
  await page.evaluate("look.eco = true; setMeShown(true); 1"); await page.waitForTimeout(300);
  const g = await gps(); return (g.length === 1 && g[0] === 'précis') || JSON.stringify(g);
});
await t('immobile depuis plus de 2 min : GPS approximatif', async () => {
  await page.evaluate("movedAt = Date.now() - 5 * 60e3; meViewSync(); 1"); await page.waitForTimeout(300);
  const g = await gps(); return (g.length === 1 && g[0] === 'approx') || JSON.stringify(g);
});
await t('en attendant le car à l’arrêt : GPS précis', async () => {
  await page.evaluate("ride.phase = 'wait'; meViewSync(); 1"); await page.waitForTimeout(300);
  const g = await gps(); await page.evaluate("ride.phase = 'idle'; 1");
  return (g.length === 1 && g[0] === 'précis') || JSON.stringify(g);
});
await t('partage avec les proches : un seul GPS (pas de doublon)', async () => {
  await page.evaluate("startShare(true); 1"); await page.waitForTimeout(400);
  const g = await gps(); return g.length === 1 || JSON.stringify(g);
});
await t('partage arrêté : 📍 reprend son propre GPS', async () => {
  await page.evaluate("stopShare(); 1"); await page.waitForTimeout(300);
  const g = await gps(); return g.length === 1 || JSON.stringify(g);
});
await t('appli cachée : plus aucun GPS', async () => {
  await page.evaluate(`Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange')); 1`);
  await page.waitForTimeout(300);
  const g = await gps();
  await page.evaluate(`Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange')); 1`);
  await page.waitForTimeout(300);
  const g2 = await gps();
  return (g.length === 0 && g2.length === 1) || JSON.stringify([g, g2]);
});
await t('économie désactivée : GPS toujours précis', async () => {
  await page.evaluate("look.eco = false; movedAt = Date.now() - 9e5; meViewSync(); 1"); await page.waitForTimeout(300);
  const g = await gps(); await page.evaluate("look.eco = true; 1");
  return (g.length === 1 && g[0] === 'précis') || JSON.stringify(g);
});
await browser.close();
if (fails.length){ console.log(`✗ ${fails.length} problème(s)`); process.exit(1); }
console.log('✓ Économie de batterie : tout est bon.');
