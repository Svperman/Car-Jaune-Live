import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844} });
await ctx.addInitScript(() => { try { localStorage.setItem('cj_tomtom', 'ABCD1234EFGH'); } catch(e){} });
await ctx.route('https://api.tomtom.com/**', r => {
  if (r.request().url().includes('/tile/')) return r.fulfill({ status:404, body:'' });
  r.fulfill({ status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ incidents: [
    { geometry:{ type:'LineString', coordinates:[[55.45,-20.88],[55.47,-20.89],[55.50,-20.90]] }, properties:{ iconCategory:6, magnitudeOfDelay:3, events:[{description:'Bouchon'}], from:'Saint-Denis', to:'Sainte-Marie', length:4200, delay:840, roadNumbers:['N2'] } },
    { geometry:{ type:'Point', coordinates:[55.47,-20.87] }, properties:{ iconCategory:9, magnitudeOfDelay:1, events:[{description:'Travaux'}], from:'Barachois', roadNumbers:['N6'] } } ] }) });
});
const pg = await ctx.newPage(); const errs=[]; pg.on('pageerror', e=>errs.push(e.message));
await pg.goto('http://localhost:8765/_test.html'); await pg.waitForTimeout(3500);
console.log('trafic affiché d’office :', await pg.evaluate('TF.on'), '| icônes sur la carte :', await pg.evaluate("document.querySelectorAll('.inc-mk').length"));
await pg.evaluate("map.setView([-20.885, 55.475], 14); 1"); await pg.waitForTimeout(600);
await pg.click('.inc-mk'); await pg.waitForTimeout(500);
console.log('popup :', (await pg.evaluate("document.querySelector('.leaflet-popup-content').innerText")).replace(/\n+/g,' | '));
await pg.screenshot({ path:'/tmp/claude-0/-home-claude/81d0d9f3-571d-5c3b-87e7-a662441dffcb/scratchpad/tf_map2.png' });
console.log('onglet trafic sans bouchons :', await pg.evaluate("!document.querySelector('#trafficList')"));
await pg.click('#btnTraffic'); await pg.waitForTimeout(300);
console.log('bouton → masqué :', await pg.evaluate("!TF.on && document.querySelectorAll('.inc-mk').length === 0"));
console.log('errors', errs); await b.close();
