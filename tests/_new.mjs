import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const pg = await b.newPage({ viewport:{width:390,height:844} });
const errs=[]; pg.on('pageerror', e=>errs.push(e.message));
await pg.goto('http://localhost:8765/_test.html'); await pg.waitForTimeout(3000);
await pg.evaluate("forceUntil = Date.now()+3600e3; updateMode(); refresh(); look.theme='light'; saveLook(); S.stops.A[3]='1'; buildStopGroups(); 1"); await pg.waitForTimeout(1500);
// 1. arrêts sur la carte
await pg.evaluate("map.setView([-20.879, 55.448], 16); 1"); await pg.waitForTimeout(800);
console.log('1. arrêts dessinés au zoom 16 :', await pg.evaluate('stopLayer.getLayers().length'));
await pg.evaluate("openStopPopup(stopGroups.find(g=>g.ids.includes('A'))); 1"); await pg.waitForTimeout(1200);
console.log('   bulle :', (await pg.evaluate("document.querySelector('.leaflet-popup-content').innerText")).replace(/\n+/g,' | '));
await pg.screenshot({ path:'/tmp/claude-0/-home-claude/81d0d9f3-571d-5c3b-87e7-a662441dffcb/scratchpad/new_stop.png' });
await pg.click('[data-sp-watch]'); await pg.waitForTimeout(500);
console.log('   surveiller → arrêt surveillé :', await pg.evaluate('board.group && board.group.name'));
// 2. serveur
await pg.evaluate('checkServer(); 1'); await pg.waitForTimeout(500);
console.log('2. voyant serveur :', await pg.evaluate("srv.state + ' ' + srv.version"));
// 3. temps appris
console.log('3. apprentissage :', await pg.evaluate(`(() => {
  const t0 = Date.now() - 3600e3;
  for (let i = 0; i < 4; i++) addLearn('A', 'B', t0 + i * 60e3, 600);
  for (let i = 0; i < 4; i++) addLearn('B', 'Z', t0 + i * 60e3, 900);
  const v = vehicles[0]; if (!v || !v.est) return 'pas d’estimation sur le car simulé (tracé trop court)';
  return 'arrivée apprise : ' + (learnedEta(v, v.est.stops.length - 1) ? 'oui' : 'non');
})()`));
// 4. correspondance à pied
console.log('4. paires de correspondance (Duparc → St-Pierre) :', await pg.evaluate(`JSON.stringify(transferHubs(findGroup('Sainte-Marie Duparc'), findGroup('Gare de St-Pierre')).map(p => p.X1.name + (p.walk ? ' →(' + p.walk + ' min à pied)→ ' + p.X2.name : '')))`));
// 5. PMR sur le tableau
await pg.click('.tab[data-view=board]'); await pg.waitForTimeout(800);
console.log('5. en-tête du tableau :', (await pg.evaluate("document.querySelector('.board-head h2') && document.querySelector('.board-head h2').innerText")));
console.log('errors', errs); await b.close();
