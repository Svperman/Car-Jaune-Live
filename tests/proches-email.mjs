// Car Jaune Live — test : e-mail automatique aux proches à la montée et à la descente
// Usage : node tests/proches-email.mjs  (après smoke.mjs ; dossier servi sur http://localhost:8765)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{ width:390, height:844 }, geolocation:{ latitude:-20.9001, longitude:55.5301, accuracy:8 }, permissions:['geolocation'] });
const ntfy = [];
await ctx.route('https://ntfy.sh/**', r => { if (r.request().method() === 'POST') ntfy.push(JSON.parse(r.request().postData())); r.fulfill({ status:200, body:'{}', headers:{ 'Access-Control-Allow-Origin':'*' } }); });
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/_test.html'); await pg.waitForTimeout(2500);
await pg.evaluate('forceUntil = Date.now() + 3600e3; updateMode(); refresh(); 1'); await pg.waitForTimeout(1500);
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };

await pg.click('#gearBtn');
await pg.evaluate("document.querySelector('#sec-proches').open = true; 1");
await pg.fill('#shName', 'Samuel'); await pg.press('#shName', 'Tab'); await pg.waitForTimeout(500);
await t('adresse invalide refusée', async () => {
  await pg.fill('#famTo', 'maman@gmail'); await pg.click('#famSave'); await pg.waitForTimeout(300);
  const r = await pg.evaluate("[shareCfg.famKey || '', document.querySelector('#toast').innerText]");
  return (!r[0] && /invalide/.test(r[1])) || JSON.stringify(r);
});
await t('2 adresses enregistrées sur le serveur', async () => {
  await pg.fill('#famTo', 'maman@gmail.com, papa@orange.fr'); await pg.click('#famSave'); await pg.waitForTimeout(600);
  const r = await pg.evaluate("[shareCfg.famKey, document.querySelector('#famTxt').innerText]");
  return (r[0] === 'k123' && /2 adresses/.test(r[1])) || JSON.stringify(r);
});
await pg.click('#setClose');
await t('montée dans le car → e-mail « dans le car »', async () => {
  await pg.evaluate("onBus = vehicles[0].id; myPos = { lat: vehicles[0].lat, lon: vehicles[0].lon, acc:8, speed:12 }; autoCheck(); rideTick(); 1");
  await pg.waitForTimeout(800);
  const r = await pg.evaluate("[(window.__mails || []).length, (window.__mails || [])[0]]");
  console.log('   ', JSON.stringify(r[1]));
  return (r[0] === 1 && r[1].k === 'depart' && r[1].key === 'k123' && r[1].n === 'Samuel' && !!r[1].l) || JSON.stringify(r);
});
await t('notification ntfy « est dans le car » avec lien', async () => {
  const m = ntfy.find(x => x.title && /est dans le car/.test(x.title));
  return (!!m && /#proche=Samuel/.test(m.click)) || JSON.stringify(ntfy.map(x => x.title));
});
await t('pas de 2e e-mail tant qu’il reste dans le car', async () => {
  await pg.evaluate("rideTick(); rideTick(); 1"); await pg.waitForTimeout(300);
  const n = await pg.evaluate("(window.__mails || []).length"); return n === 1 || n;
});
await t('sans réseau : e-mail mis de côté puis envoyé', async () => {
  const r = await pg.evaluate(`(async () => {
    const real = google.script.run; let off = true;
    const desc = Object.getOwnPropertyDescriptor(google.script, 'run');
    Object.defineProperty(google.script, 'run', { configurable:true, get(){ if (!off) return desc.get(); let ko = null; const p = new Proxy({}, { get(_, k){ return String(k).startsWith('with') ? (f => { if (k === 'withFailureHandler') ko = f; return p; }) : () => setTimeout(() => ko(new Error('Failed to fetch')), 10); } }); return p; } });
    mailFamily({ k:'arrive', stop:'Gare de St-Benoît', at: Date.now() });
    await new Promise(r => setTimeout(r, 200));
    const queued = (outbox.mails || []).length;
    off = false; await flushOutbox();
    return [queued, (outbox.mails || []).length, window.__mails.length, (window.__mails[1] || {}).k];
  })()`);
  return (r[0] === 1 && r[1] === 0 && r[2] === 2 && r[3] === 'arrive') || JSON.stringify(r);
});
errs.forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ E-mails aux proches : tout est bon.');
