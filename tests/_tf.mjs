import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844} });
let tiles = 0, inc = 0;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
await ctx.route('https://api.tomtom.com/**', r => {
  const u = r.request().url();
  if (u.includes('/tile/')){ tiles++; return r.fulfill({ status:200, body:PNG, contentType:'image/png', headers:{'Access-Control-Allow-Origin':'*'} }); }
  inc++;
  r.fulfill({ status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ incidents: [
    { type:'Feature', geometry:{ type:'LineString', coordinates:[[55.45,-20.88],[55.47,-20.89],[55.50,-20.90]] }, properties:{ iconCategory:6, magnitudeOfDelay:3, events:[{description:'Bouchon'}], from:'Saint-Denis', to:'Sainte-Marie', length:4200, delay:840, roadNumbers:['N2'] } },
    { type:'Feature', geometry:{ type:'Point', coordinates:[55.28,-21.0] }, properties:{ iconCategory:1, magnitudeOfDelay:2, events:[{description:'Accident'}], from:'Saint-Paul', to:'Le Port', delay:300, roadNumbers:['N1'] } } ] }) });
});
const pg = await ctx.newPage(); const errs=[]; pg.on('pageerror', e=>errs.push(e.message));
await pg.goto('http://localhost:8765/_test.html'); await pg.waitForTimeout(3000);
await pg.evaluate("forceUntil = Date.now() + 3600e3; updateMode(); refresh(); 1"); await pg.waitForTimeout(1500);
// 1. sans clé : bouchon vu par un car (2 positions lentes loin d'un arrêt)
await pg.evaluate(`toggleTraffic(true);
  const v = vehicles[0]; v.lat = -20.95; v.lon = 55.60; v.speed = 1; v.age = 0; updateMotion(v); busJamTick();
  v.lat = -20.951; v.lon = 55.602; updateMotion(v); busJamTick(); 1`);
console.log('bouchons vus par les cars :', await pg.evaluate("Object.values(TF.jams).map(j => j.l + ' ' + Math.round(j.sp*3.6) + ' km/h').join(', ')"), '| tracés dessinés :', await pg.evaluate("jamLayer.getLayers().length"));
// 2. clé TomTom
await pg.click('#gearBtn'); await pg.fill('#tfKey', 'ABCD1234EFGH'); await pg.click('#tfKeySave'); await pg.waitForTimeout(1500);
console.log('réglage :', await pg.evaluate("$('#tfKeyTxt').textContent"), '| tuiles demandées :', tiles, '| incidents :', inc);
await pg.click('#setClose');
await pg.evaluate("map.setView([-20.89, 55.48], 13); 1"); await pg.waitForTimeout(800);
await pg.screenshot({ path:'/tmp/claude-0/-home-claude/81d0d9f3-571d-5c3b-87e7-a662441dffcb/scratchpad/tf_map.png' });
await pg.click('.tab[data-view=trafic]'); await pg.waitForTimeout(800);
console.log('onglet trafic :', (await pg.evaluate("$('#trafficList').innerText")).replace(/\n+/g,' | ').slice(0, 400));
await pg.screenshot({ path:'/tmp/claude-0/-home-claude/81d0d9f3-571d-5c3b-87e7-a662441dffcb/scratchpad/tf_tab.png' });
await pg.click('[data-inc="0"]'); await pg.waitForTimeout(1500);
console.log('après « voir sur la carte » : vue', await pg.evaluate('view'), '| surbrillance', await pg.evaluate('!!tfHighlight'));
console.log('errors', errs); await b.close();
