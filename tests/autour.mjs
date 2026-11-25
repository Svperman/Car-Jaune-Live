// Car Jaune Live — test du nouvel accueil « Autour de toi » (panneau glissant façon appli de transport) et du mode GO.
// Usage : node tests/autour.mjs (après smoke.mjs, dossier servi sur :8765)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const BUS = readFileSync('tests/tout.mjs', 'utf8').match(/const BUS = `([\s\S]*?)`;/)[1];
const fails = [];
const t = async (label, fn) => {
  try { const r = await fn(); if (r === true) console.log('✓ ' + label); else { fails.push(label); console.log('✗ ' + label + ' : ' + r); } }
  catch (e) { fails.push(label); console.log('✗ ' + label + ' : ' + e.message.split('\n')[0]); }
};
const browser = await chromium.launch();
for (const [nom, vp] of [['téléphone', { width: 390, height: 844 }], ['ordinateur', { width: 1280, height: 800 }]]){
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 600 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/_test.html');
  await page.waitForTimeout(2500);
  await page.evaluate(`forceUntil = Date.now() + 3600e3; updateMode(); refresh(); document.querySelector('#geoSheet').hidden = true; 1`);
  await page.waitForTimeout(1500);
  const P = `[${nom}] `;

  await t(P + 'panneau visible sur la carte, caché ailleurs', async () => {
    const a = await page.evaluate("setView('map'); !document.querySelector('#nearSheet').hidden");
    const b = await page.evaluate("setView('board'); document.querySelector('#nearSheet').hidden");
    await page.evaluate("setView('map'); 1");
    return (a && b) || JSON.stringify([a, b]);
  });
  await t(P + 'lignes autour de ma position : cars jaunes + Citalis, minutes en gros', async () => {
    await page.evaluate("myPos = { lat: -20.879, lon: 55.448, acc: 10 }; myFixAt = Date.now(); nsRefresh(true)");
    await page.waitForFunction(() => document.querySelectorAll('#nsList .ns-card').length > 0, null, { timeout: 15000 });
    const r = await page.evaluate(`[...document.querySelectorAll('#nsList .ns-card')].map(c => [c.querySelector('.ns-l').childNodes[0].textContent, c.querySelector('.ns-l small') ? c.querySelector('.ns-l small').textContent : 'CJ', c.querySelector('.ns-m').innerText.replace(/\\s+/g, ' '), c.getAttribute('aria-label')])`);
    const cj = r.filter(x => x[1] === 'CJ'), cit = r.filter(x => x[1] === 'Citalis');
    console.log('    ', r.length, 'cartes ·', cj.map(x => x[0] + ' ' + x[2]).join(', '));
    return (cj.length > 0 && cit.length > 0 && r.every(x => /ligne .+ vers .+ arrêt .+ à pied/.test(x[3]))) || JSON.stringify(r.slice(0, 4));
  });
  await t(P + 'une seule carte par ligne et direction', async () => {
    const r = await page.evaluate(`(() => { const k = [...document.querySelectorAll('#nsList .ns-card')].map(c => c.querySelector('.ns-l').textContent + '|' + c.querySelector('.ns-dir').textContent); return k.length === new Set(k).size || k.join(' ; '); })()`);
    return r;
  });
  await t(P + 'toucher une carte ouvre les horaires de l’arrêt', async () => {
    await page.evaluate("document.querySelector('#nsList .ns-card').click(); 1");
    await page.waitForTimeout(500);
    const r = await page.evaluate("[view, board.group && board.group.name]");
    await page.evaluate("setView('map'); 1");
    return (r[0] === 'board' && !!r[1]) || JSON.stringify(r);
  });
  await t(P + 'sans position : centre de la carte, message clair si rien autour', async () => {
    const r = await page.evaluate(`(async () => { myPos = null; map.setView([-21.1, 55.55], 13, { animate:false }); await nsRefresh(true);
      return [document.querySelector('#nsWhere').textContent, document.querySelector('#nsList').innerText]; })()`);
    return (/centre/.test(r[0]) && /Aucune ligne ici/.test(r[1])) || JSON.stringify(r);
  });
  await t(P + '« Où vas-tu ? » ouvre Mon trajet', async () => {
    await page.evaluate("document.querySelector('#nsSearch').click(); 1"); await page.waitForTimeout(300);
    const v = await page.evaluate('view'); await page.evaluate("setView('map'); 1");
    return v === 'trip' || v;
  });
  if (nom === 'téléphone'){
    await t(P + 'glisser au doigt : 3 hauteurs, boutons de la carte au-dessus du panneau', async () => {
      const box = await page.locator('#nsGrab').boundingBox();
      const h0 = await page.evaluate("document.querySelector('#nearSheet').getBoundingClientRect().height");
      await page.mouse.move(box.x + box.width / 2, box.y + 5); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y - 300, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(450);
      const r1 = await page.evaluate("[ns.snap, document.querySelector('#nearSheet').getBoundingClientRect().height]");
      const b2 = await page.locator('#nsGrab').boundingBox();
      await page.mouse.move(b2.x + b2.width / 2, b2.y + 5); await page.mouse.down();
      await page.mouse.move(b2.x + b2.width / 2, b2.y + 700, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(450);
      const r2 = await page.evaluate("[ns.snap, document.querySelector('#nearSheet').getBoundingClientRect().height]");
      await page.evaluate("nsSetSnap('mid'); 1"); await page.waitForTimeout(350);
      const lay = await page.evaluate(`(() => { const s = document.querySelector('#nearSheet').getBoundingClientRect(), b = document.querySelector('#mapCard .leaflet-bottom.leaflet-right').getBoundingClientRect(), t = document.querySelector('.tabs').getBoundingClientRect(); return [b.bottom <= s.top + 2, s.bottom <= t.top + 2]; })()`);
      return (r1[0] === 'full' && r1[1] > h0 && r2[0] === 'mini' && r2[1] < 180 && lay[0] && lay[1]) || JSON.stringify([h0, r1, r2, lay]);
    });
  }
  await t(P + 'mode GO dans le car : ligne, arrêts qui défilent, toucher un arrêt = me prévenir', async () => {
    const r = await page.evaluate(`(async () => { ${BUS}; setView('map'); nsRender();
      const el = document.querySelector('#nearSheet'), go = el.classList.contains('go');
      const stops = [...document.querySelectorAll('.go-stops button')].map(b => b.dataset.goStop);
      const tip = !!document.querySelector('.go-tip');
      [...document.querySelectorAll('.go-stops button')].pop().click();
      const tgt = document.querySelector('.go-tgt') ? document.querySelector('.go-tgt').innerText.replace(/\\s+/g, ' ') : '';
      const pick = descPick && descPick.name;
      setDescPick(null); onBus = null; nsRender();
      return [go, stops, tip, tgt, pick, el.classList.contains('go')]; })()`);
    return (r[0] && r[1].length >= 2 && r[2] && /descends à .*St-Beno/i.test(r[3]) && /St-Beno/.test(r[4]) && r[5] === false) || JSON.stringify(r);
  });
  await t(P + 'réglage : couper le panneau', async () => {
    const r = await page.evaluate(`(() => { const c = document.querySelector('#nsOn'); c.checked = false; c.dispatchEvent(new Event('change'));
      const off = document.querySelector('#nearSheet').hidden; c.checked = true; c.dispatchEvent(new Event('change'));
      return [off, !document.querySelector('#nearSheet').hidden]; })()`);
    return (r[0] && r[1]) || JSON.stringify(r);
  });
  await t(P + 'carte « Épuré » par défaut ; le plan de secours n’écrase pas le choix', async () => {
    const r = await page.evaluate("[Object.keys(BASES)[0], baseName, localStorage.getItem('cj_base')]");
    return (r[0] === 'Épuré' && r[1] === 'Épuré' && r[2] !== 'Plan Esri') || JSON.stringify(r);
  });
  await t(P + 'menu façon Transit : tuiles, chaque tuile ouvre la bonne page', async () => {
    const r = await page.evaluate(`(async () => {
      document.querySelector('#nsMenu').click(); await new Promise(r => setTimeout(r, 150));
      const tiles = [...document.querySelectorAll('#menuBox [data-mn]')].map(b => b.dataset.mn);
      const out = {};
      for (const k of ['board', 'fiches', 'trip', 'avion', 'trafic', 'arrets', 'lignes']){
        openMenu(); document.querySelector('#menuBox [data-mn="' + k + '"]').click(); await new Promise(r => setTimeout(r, 120));
        out[k] = [view, document.querySelector('#menuOv').hidden];
      }
      openMenu(); document.querySelector('#menuBox [data-mn="reglages"]').click(); const set = !document.querySelector('#settingsModal').hidden; closeSettings();
      setView('map'); return [tiles.length, out, set]; })()`);
    const o = r[1], ok = r[0] >= 12 && o.board[0] === 'board' && o.fiches[0] === 'fiches' && o.trip[0] === 'trip' && o.avion[0] === 'avion' && o.trafic[0] === 'trafic'
      && o.arrets[0] === 'board' && o.lignes[0] === 'fiches' && Object.values(o).every(x => x[1]) && r[2];
    return ok || JSON.stringify(r);
  });
  await t(P + 'bouton 🚡 Téléphérique Papang : carte centrée sur la ligne, 5 stations nommées', async () => {
    await page.evaluate("document.querySelector('[data-go-papang]').click(); 1");
    await page.waitForTimeout(2500);
    const r = await page.evaluate(`[view, map.getBounds().contains([-20.9037, 55.4835]), [...document.querySelectorAll('.pap-tt')].map(x => x.textContent.replace('🚡', '').trim())]`);
    return (r[0] === 'map' && r[1] && r[2].length === 5 && new Set(r[2]).size === 5) || JSON.stringify(r);
  });
  await t(P + 'aucune erreur JavaScript', async () => errs.length === 0 || errs.join(' | '));
  await ctx.close();
}
await browser.close();
if (fails.length){ console.log(`✗ ${fails.length} problème(s)`); process.exit(1); }
console.log('✓ Autour de toi : tout est bon');
