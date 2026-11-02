import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const pg = await b.newPage();
const errs=[]; pg.on('pageerror', e=>errs.push(e.message));
await pg.goto('http://localhost:8765/_test.html'); await pg.waitForTimeout(2500);
console.log(await pg.evaluate(`(() => {
  LEARN = {};
  const stops = [{id:'Q1',sec:0},{id:'Q2',sec:300},{id:'Q3',sec:600},{id:'Q4',sec:900}];
  const t0 = Date.now()/1000;
  const v = { id:'bx', tripId:'tx', est:{ k:0, f:0.9, t:t0, stops } }; learnPass(v);
  v.est = { k:1, f:0.05, t:t0+60, stops }; learnPass(v);
  v.est = { k:2, f:0.02, t:t0+60+420, stops }; learnPass(v);
  return 'passages observés → tronçon Q2>Q3 appris : ' + JSON.stringify(LEARN['Q2>Q3']) + ' s (≈ 7 min réels, fiche 5 min)';
})()`));
console.log('errors', errs); await b.close();
