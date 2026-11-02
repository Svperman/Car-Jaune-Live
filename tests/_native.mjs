import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844} });
await ctx.addInitScript(() => {
  window.__log = [];
  window.Capacitor = { isNativePlatform: () => true, Plugins: {
    BackgroundGeolocation: { addWatcher: async (o, cb) => { __log.push('watch:' + o.backgroundMessage); setTimeout(() => cb({ latitude:-20.879, longitude:55.448, accuracy:9, speed:0, bearing:0, time:Date.now() }), 300); return 'w1'; },
                             removeWatcher: async o => { __log.push('stop:' + o.id); } },
    LocalNotifications: { checkPermissions: async () => ({ display:'granted' }), requestPermissions: async () => ({ display:'granted' }),
                          schedule: async o => { __log.push('notif:' + o.notifications[0].title); } } } };
});
await ctx.route('https://ntfy.sh/**', r => r.fulfill({ status:200, body:'{}', headers:{'Access-Control-Allow-Origin':'*'} }));
const pg = await ctx.newPage(); const errs=[]; pg.on('pageerror', e=>errs.push(e.message));
await pg.goto('http://localhost:8765/_test.html'); await pg.waitForTimeout(3000);
await pg.evaluate("shareCfg.name='Samuel'; setShareOn(true); 1"); await pg.waitForTimeout(2500);
await pg.evaluate("Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true}); notify('🚌 E1 dans 5 min','Départ 08:20'); 1"); await pg.waitForTimeout(500);
await pg.evaluate("setShareOn(false); 1"); await pg.waitForTimeout(800);
console.log('appels natifs :', JSON.stringify(await pg.evaluate('__log')));
console.log('statut notif :', await pg.evaluate('notifStatus().k'), '| errors', errs);
await b.close();
