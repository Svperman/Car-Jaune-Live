// Car Jaune Live — test accessibilité : tout ce qu'on peut toucher a un nom lu par VoiceOver (iPhone) / TalkBack (Android).
// Usage : node tests/accessibilite.mjs (après smoke.mjs, dossier servi sur :8765)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const browser = await chromium.launch();
let fails = 0;
for (const mode of ['', '?user=1']) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  await page.goto(BASE + '/_test.html' + mode);
  await page.waitForTimeout(3000);
  await page.evaluate("forceUntil = Date.now() + 3600e3; updateMode(); refresh(); 1");
  await page.waitForTimeout(1500);
  for (const v of ['trip', 'board', 'fiches', 'info', 'map']) await page.evaluate(`setView('${v}'); 1`);
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const txt = id => { const e = document.getElementById(id); return e ? e.textContent.trim() : ''; };
    const name = el => {
      const lb = el.getAttribute('aria-labelledby');
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      if (lb) return lb.split(' ').map(txt).join(' ').trim();
      if (el.matches('input,select,textarea')){
        const l = el.id && document.querySelector(`label[for="${el.id}"]`);
        return (l && l.textContent.trim()) || (el.closest('label') && el.closest('label').textContent.trim()) || el.placeholder || el.title || '';
      }
      return (el.title || el.textContent || '').replace(/\s+/g, ' ').trim();
    };
    const bad = [];
    document.querySelectorAll('button, a[href], [role=button], input:not([type=hidden]), select, textarea').forEach(el => {
      const n = name(el);
      const decorOnly = /^[\p{Extended_Pictographic}️‍\s✕×☰‹›←→+−⌄]*$/u.test(n);
      if (!n || (decorOnly && !el.getAttribute('aria-label') && !el.title)) bad.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]) + ' «' + n + '»');
    });
    const buses = [...document.querySelectorAll('.leaflet-marker-icon .bus-mk')].map(b => b.closest('.leaflet-marker-icon'));
    return { bad: [...new Set(bad)], buses: buses.length, busNamed: buses.filter(b => /Car jaune ligne/.test(b.getAttribute('aria-label') || '')).length,
      cur: document.querySelector('.tab[aria-current=page]') ? document.querySelector('.tab[aria-current=page]').dataset.view : null,
      toast: document.querySelector('#toast').getAttribute('aria-live') };
  });
  const who = mode ? 'utilisateur' : 'créateur';
  const ok = !r.bad.length && r.buses > 0 && r.busNamed === r.buses && r.cur === 'map' && r.toast === 'polite';
  console.log((ok ? '✓ ' : '✗ ') + `[${who}] noms accessibles : ${r.bad.length ? r.bad.join(', ') : 'tous'} · cars nommés ${r.busNamed}/${r.buses} · onglet courant ${r.cur}`);
  if (!ok) fails++;
}
await browser.close();
if (fails){ console.log('✗ problème(s) d’accessibilité'); process.exit(1); }
console.log('✓ Accessibilité : tout est bon.');
