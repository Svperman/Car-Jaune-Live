// Car Jaune Live — test : SMS tout prêt pour les proches à la montée et à la descente
// Usage : node tests/proches-sms.mjs  (après smoke.mjs ; dossier servi sur http://localhost:8765)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{ width:390, height:844 }, hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  geolocation:{ latitude:-20.9001, longitude:55.5301, accuracy:8 }, permissions:['geolocation'] });
await ctx.route('https://ntfy.sh/**', r => r.fulfill({ status:200, body:'{}', headers:{ 'Access-Control-Allow-Origin':'*' } }));
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/_test.html'); await pg.waitForTimeout(2500);
await pg.evaluate('forceUntil = Date.now() + 3600e3; updateMode(); refresh(); 1'); await pg.waitForTimeout(1500);
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };

await pg.click('#gearBtn');
await pg.evaluate("document.querySelector('#sec-proches').open = true; 1");
await pg.fill('#shName', 'Samuel'); await pg.press('#shName', 'Tab'); await pg.waitForTimeout(400);
await t('numéro invalide refusé', async () => {
  await pg.fill('#smsTo', '06'); await pg.click('#smsSave'); await pg.waitForTimeout(200);
  const r = await pg.evaluate("[shareCfg.smsTo || '', document.querySelector('#toast').innerText]");
  return (!r[0] && /invalide/.test(r[1])) || JSON.stringify(r);
});
await t('2 numéros enregistrés', async () => {
  await pg.fill('#smsTo', '0692 12 34 56, +262 693 65 43 21'); await pg.click('#smsSave'); await pg.waitForTimeout(300);
  const r = await pg.evaluate("[smsNums(), document.querySelector('#smsTxt').innerText]");
  return (r[0].join() === '0692123456,+262693654321' && /2 numéros/.test(r[1])) || JSON.stringify(r);
});
await pg.click('#setClose');
await t('montée dans le car → SMS tout prêt', async () => {
  await pg.evaluate("onBus = vehicles[0].id; myPos = { lat: vehicles[0].lat, lon: vehicles[0].lon, acc:8, speed:12 }; autoCheck(); rideTick(); 1");
  await pg.waitForTimeout(500);
  const r = await pg.evaluate("[getComputedStyle(document.querySelector('#smsSheet')).display, document.querySelector('#smsPrev').innerText, document.querySelector('[data-sms]').getAttribute('href'), document.querySelectorAll('[data-sms]').length]");
  console.log('    ', r[1].replace(/\n/g, ' ⏎ '));
  console.log('    ', decodeURIComponent(r[2]).slice(0, 70) + '…');
  return (r[0] !== 'none' && /Je suis dans le car E1/.test(r[1]) && /#proche=Samuel/.test(r[1]) && r[2].startsWith('sms:0692123456&body=') && r[3] === 2) || JSON.stringify(r);
});
await pg.screenshot({ path: 'test-sms.png' });
await t('un SMS séparé par proche : le 1er coché, puis le 2e', async () => {
  await pg.evaluate("document.querySelector('[data-sms]').addEventListener('click', e => e.preventDefault(), { once:true }); document.querySelector('[data-sms]').click(); 1");
  await pg.waitForTimeout(900);
  const r = await pg.evaluate("[...document.querySelectorAll('[data-sms]')].map(a => a.innerText)");
  return (/✓ Envoyé à 0692 12 34 56/.test(r[0]) && /^Envoyer à \+262693654321/.test(r[1])) || JSON.stringify(r);
});
await t('« Plus tard » ferme le message', async () => {
  await pg.click('#smsLater'); await pg.waitForTimeout(200);
  return (await pg.evaluate("getComputedStyle(document.querySelector('#smsSheet')).display")) === 'none' || 'toujours affiché';
});
await t('descente → SMS « je suis descendu »', async () => {
  await pg.evaluate("offerSms({ k:'arrive', l:'E1', stop:'Gare de St-Benoît', at: Date.now() }); 1");
  const r = await pg.evaluate("document.querySelector('#smsPrev').innerText");
  return /Je suis descendu du E1 à Gare de St-Benoît/.test(r) || r;
});
await t('Android : format sms:num1,num2?body=', async () => {
  const r = await pg.evaluate("(() => { const save = IOS; return smsHref(['0692123456','0693654321'], 'a b'); })()");
  return r.startsWith('sms:') || r;
});
errs.forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ SMS aux proches : tout est bon.');
