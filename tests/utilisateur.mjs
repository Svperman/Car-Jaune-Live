// Car Jaune Live — test : réglages simplifiés pour les utilisateurs, complets en mode créateur (7 touches)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const b = await chromium.launch();
const pg = await (await b.newContext({ viewport:{ width:390, height:844 } })).newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/_test.html?user=1'); await pg.waitForTimeout(2500);
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };
await pg.evaluate("document.querySelector('#geoSheet').hidden = true; 1");
await pg.click('#gearBtn'); await pg.waitForTimeout(300);
const vis = sel => pg.evaluate(`(() => { const e = document.querySelector('${sel}'); return !!e && getComputedStyle(e).display !== 'none'; })()`);
await t('utilisateur : réglages avancés cachés', async () => {
  const r = [await vis('#tfKeyRow'), await vis('#pushSec'), await vis('#apiRow'), await vis('#packRow')];
  return r.every(x => !x) || JSON.stringify(r);
});
await t('utilisateur : l’essentiel reste visible (dont « Cars dans ma ville »)', async () => {
  const r = [await vis('#sec-alertes'), await vis('#sec-proches'), await vis('#citySec'), await vis('#sec-carte'), await vis('#sec-appli')];
  return r.every(Boolean) || JSON.stringify(r);
});
await t('7 touches en bas des réglages → mode créateur', async () => {
  for (let i = 0; i < 7; i++) await pg.click('#setFoot');
  await pg.waitForTimeout(200);
  const r = [await vis('#tfKeyRow'), await pg.evaluate("localStorage.getItem('cj_creator')"), await pg.evaluate("document.querySelector('#settingsModal .set-head h2').innerText")];
  return (r[0] && r[1] === '1' && /créateur/.test(r[2])) || JSON.stringify(r);
});
await t('7 touches de plus → retour à la vue simplifiée', async () => {
  for (let i = 0; i < 7; i++) await pg.click('#setFoot');
  await pg.waitForTimeout(200);
  return !(await vis('#tfKeyRow')) || 'toujours visible';
});
errs.forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Réglages utilisateur / créateur : tout est bon.');
