// Car Jaune Live — test des mises à jour automatiques (pareil iPhone / Android, comme Trafic Péi).
// Usage : node tests/maj.mjs (après tests/smoke.mjs, qui crée _test.html ; dossier servi sur :8765)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8765';
// page « version A » vue comme une vraie appli publiée (pas dans Apps Script)
const page0 = readFileSync('_test.html', 'utf8')
  .replace(/const IN_GAS = [^;]+;/, 'const IN_GAS = false;')
  .replace("const APP_BUILD = '__BUILD__'", "const APP_BUILD = 'A'");
if (!page0.includes("APP_BUILD = 'A'")) { console.error('✗ préparation impossible'); process.exit(1); }
writeFileSync('_maj.html', page0);
const newer = page0.replace("APP_BUILD = 'A'", "APP_BUILD = 'B'");

const fails = [];
const t = async (label, fn) => {
  try { const r = await fn(); if (r === true) console.log('✓ ' + label); else { fails.push(label + ' : ' + r); console.log('✗ ' + label + ' : ' + r); } }
  catch (e) { fails.push(label + ' : ' + e.message.split('\n')[0]); console.log('✗ ' + label + ' : ' + e.message.split('\n')[0]); }
};
const browser = await chromium.launch();
async function open(){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.route(/\?maj=/, r => r.fulfill({ status: 200, contentType: 'text/html', body: newer }));
  await page.goto(BASE + '/_maj.html');
  await page.waitForTimeout(2500);
  // (on ferme la fenêtre « Autoriser la localisation » du premier lancement)
  await page.evaluate("backOpen().forEach(id => document.getElementById(id).hidden = true); window.__avant = 1");
  return { ctx, page };
}
const back = p => p.evaluate("document.dispatchEvent(new Event('visibilitychange')); 1");
const reloaded = p => p.evaluate('typeof window.__avant === "undefined"');

await t('nouvelle version : se recharge toute seule au retour sur l’appli', async () => {
  const { ctx, page } = await open();
  await back(page); await page.waitForTimeout(3500);
  const r = [await reloaded(page), await page.evaluate("document.querySelector('#toast').innerText")];
  await ctx.close();
  return (r[0] && /à jour/.test(r[1])) || JSON.stringify(r);
});
await t('pas de recharge en plein trajet, puis mise à jour dès que c’est calme', async () => {
  const { ctx, page } = await open();
  await page.evaluate("ride.phase = 'ride'; 1");
  await back(page); await page.waitForTimeout(2500);
  const pendant = await reloaded(page);
  await page.evaluate("ride.phase = 'idle'; 1");
  await page.waitForTimeout(17000);
  const apres = await reloaded(page);
  await ctx.close();
  return (!pendant && apres) || JSON.stringify({ pendant, apres });
});
await t('pas de recharge pendant qu’on écrit', async () => {
  const { ctx, page } = await open();
  await page.evaluate("setView('board'); document.querySelector('#stopInput').focus(); 1");
  await back(page); await page.waitForTimeout(2500);
  const r = await reloaded(page);
  await ctx.close();
  return !r || 'rechargée pendant la saisie';
});
await t('même version : rien ne se passe', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.route(/\?maj=/, r => r.fulfill({ status: 200, contentType: 'text/html', body: page0 }));
  await page.goto(BASE + '/_maj.html'); await page.waitForTimeout(2500);
  await page.evaluate('window.__avant = 1');
  await back(page); await page.waitForTimeout(2500);
  const r = await reloaded(page);
  await ctx.close();
  return !r || 'rechargée sans raison';
});
await browser.close();
try { unlinkSync('_maj.html'); } catch(e){}
if (fails.length){ console.log(`✗ ${fails.length} problème(s)`); process.exit(1); }
console.log('✓ Mises à jour automatiques : tout est bon.');
