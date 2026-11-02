// Car Jaune Live — test automatique avant publication.
// Ouvre l'appli avec un faux serveur (tests/mock.js) sur téléphone et ordinateur, parcourt chaque onglet
// et les panneaux, et échoue s'il y a la moindre erreur JavaScript.
// Usage : node tests/smoke.mjs   (le dossier doit être servi sur http://localhost:8765)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8765';
// page de test = index.html + faux serveur injecté avant le script de l'appli
const html = readFileSync('index.html', 'utf8').replace(
  /(<script src="lib\/protobuf\.min\.js"><\/script>)/,
  '$1<script src="tests/mock.js"></script>');
if (!html.includes('tests/mock.js')) { console.error('✗ impossible d’injecter le faux serveur'); process.exit(1); }
// en local sans Internet : bibliothèques servies depuis node_modules (LOCAL=1)
const page0 = process.env.LOCAL ? html
  .replace(/https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\//g, 'node_modules/leaflet/dist/')
  .replace('https://cdn.jsdelivr.net/npm/leaflet-rotate@0.2.8/dist/', 'node_modules/leaflet-rotate/dist/')
  .replace('https://cdn.jsdelivr.net/npm/protobufjs@7.4.0/dist/', 'node_modules/protobufjs/dist/') : html;
writeFileSync('_test.html', page0);

const failures = [];
const browser = await chromium.launch();
for (const [name, vp] of [['téléphone', { width: 390, height: 844 }], ['ordinateur', { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: name === 'téléphone',
    geolocation: { latitude: -20.879, longitude: 55.448, accuracy: 20 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(BASE + '/_test.html');
  await page.waitForTimeout(3000);
  const step = async (label, fn) => {
    try { await fn(); } catch (e) { failures.push(`[${name}] ${label} : ${e.message.split('\n')[0]}`); }
  };
  await step('carte et cars', async () => {
    await page.evaluate('forceUntil = Date.now() + 3600e3; updateMode(); refresh(); 1');
    await page.waitForTimeout(1500);
    const n = await page.evaluate('vehicles.length');
    if (!n) throw new Error('aucun car affiché');
  });
  for (const v of ['trip', 'board', 'fiches', 'trafic', 'map']) {
    await step('onglet ' + v, async () => { await page.click(`.tab[data-view=${v}]`); await page.waitForTimeout(400); });
  }
  await step('arrêt et départs', async () => {
    await page.evaluate("selectStop(stopGroups.find(g => g.ids.includes('A'))); 1");
    await page.waitForTimeout(800);
    const t = await page.evaluate("document.querySelector('#boardCard').innerText");
    if (!/Gare de St-Denis/.test(t)) throw new Error('tableau des départs vide');
  });
  await step('mon trajet + correspondances', async () => {
    await page.evaluate("trip.a='Gare de St-Denis'; trip.b='Gare de St-Benoît'; tripBoard={key:'',data:null,loading:false}; setView('trip'); 1");
    await page.waitForTimeout(1200);
  });
  await step('paramètres', async () => { await page.click('#gearBtn'); await page.waitForTimeout(300); await page.click('#setClose'); });
  await step('cloche', async () => { await page.click('#bellBtn'); await page.waitForTimeout(200); await page.click('#bellBtn'); });
  await step('prochain car', async () => { await page.evaluate('openNext(); 1'); await page.waitForTimeout(500); await page.evaluate('closeNext(); 1'); });
  await step('mode sombre', async () => { await page.evaluate("look.theme='dark'; saveLook(); 1"); await page.waitForTimeout(200); });
  await step('alerte', async () => { await page.evaluate("notify('Test', 'message')"); });
  await page.screenshot({ path: `test-${name === 'téléphone' ? 'mobile' : 'desktop'}.png` });
  errs.forEach(e => failures.push(`[${name}] erreur JS : ${e}`));
  await ctx.close();
}
await browser.close();

if (failures.length) {
  console.error('✗ ' + failures.length + ' problème(s) :\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('✓ Tout est bon : aucune erreur sur téléphone et ordinateur.');
