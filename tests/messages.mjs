// Car Jaune Live — test : messages depuis la carte (proche : texte libre chiffré ; voyageur anonyme : questions toutes faites)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const fails = [];
const store = [];
const b = await chromium.launch();
async function phone(){
  const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
  await ctx.route('https://ntfy.sh/**', async r => {
    const req = r.request(), h = { 'Access-Control-Allow-Origin':'*' };
    if (req.method() === 'POST'){ const o = JSON.parse(req.postData()); store.push({ id: 'm' + store.length, time: Math.floor(Date.now() / 1000), event:'message', topic: o.topic, message: o.message || '' }); return r.fulfill({ status:200, headers:h, body:'{}' }); }
    const u = new URL(req.url()), topic = u.pathname.split('/')[1], since = u.searchParams.get('since') || '';
    let list = store.filter(m => m.topic === topic);
    if (/^m\d+$/.test(since)) list = list.filter(m => +m.id.slice(1) > +since.slice(1));
    r.fulfill({ status:200, headers:h, body: list.map(m => JSON.stringify(m)).join('\n') });
  });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(BASE + '/_test.html'); await p.waitForTimeout(2500);
  await p.evaluate("document.querySelector('#geoSheet').hidden = true; forceUntil = Date.now() + 3600e3; updateMode(); refresh(); 1"); await p.waitForTimeout(1200);
  return p;
}
const A = await phone(), B = await phone();
const t = async (label, fn) => { try { const r = await fn(); if (r !== true) fails.push(label + ' : ' + r); else console.log('✓ ' + label); } catch(e){ fails.push(label + ' : ' + e.message.split('\n')[0]); } };
const lastIn = p => p.evaluate("(inbox[0] || {}).title + ' | ' + (inbox[0] || {}).body");

// --- voyageurs anonymes
await A.evaluate("shareCfg.crowd = true; onBus = vehicles[0].id; myPos = { lat: vehicles[0].lat, lon: vehicles[0].lon, acc: 10, speed: 12 }; myFixAt = Date.now(); crowd.last = 0; crowdTick(); 1");
await A.waitForTimeout(300);
await B.evaluate("crowd.at = 0; crowdPoll()"); await B.waitForTimeout(500);
await t('voyageur : je lui pose « Ton car est plein ? » depuis sa bulle', async () => {
  await B.evaluate("const id = Object.keys(crowd.mk)[0]; crowd.mk[id].openPopup(); 1"); await B.waitForTimeout(200);
  await B.click('[data-chat-crowd]'); await B.waitForTimeout(200);
  const chips = await B.evaluate("document.querySelectorAll('#msgChips button').length + '/' + getComputedStyle(document.querySelector('#msgInRow')).display");
  await B.click('#msgChips button:nth-child(2)'); await B.waitForTimeout(300);
  return chips === '8/none' || 'pastilles / texte libre caché : ' + chips;
});
await t('voyageur : il reçoit la question', async () => {
  await A.evaluate("crowd.at = 0; crowdPoll()"); await A.waitForTimeout(500);
  const r = await lastIn(A); return /Un voyageur.*Ton car est plein/.test(r) || r;
});
await t('voyageur : il répond « Il reste de la place » en 1 touche, je reçois la réponse', async () => {
  await A.evaluate("chatOpenCrowd(Object.keys(chats)[0].slice(2)); 1"); await A.waitForTimeout(200);
  await A.click('#msgChips button:nth-child(7)'); await A.waitForTimeout(300);
  await B.evaluate("crowd.at = 0; crowdPoll()"); await B.waitForTimeout(500);
  const r = await B.evaluate("document.querySelector('#msgLog').innerText"); return /Il reste de la place/.test(r) || r;
});
await t('voyageur : impossible d’envoyer du texte libre', async () => {
  const n = store.length;
  await B.evaluate("chatSend('Donne-moi ton numéro')"); await B.waitForTimeout(300);
  return store.length === n || 'texte libre envoyé';
});

// --- proches
await A.evaluate("shareCfg.name = 'Samuel'; shareCfg.code = '482913'; shareCfg.auto = true; saveShare(); chatOwnAt = 0; 1");
await B.evaluate("shareCfg.name = 'Maman'; saveShare(); addFriend('Samuel', '482913', true); 1"); await B.waitForTimeout(300);
await A.evaluate("pushShare({ lat: -20.9, lon: 55.5, acc: 10, t: Date.now() })"); await A.waitForTimeout(300);
await B.evaluate("pollFriends()"); await B.waitForTimeout(1500);
await t('proche : je lui écris « Tu es où ? » (texte libre, chiffré)', async () => {
  await B.evaluate("chatOpenFriend(friends[0]); 1"); await B.fill('#msgIn', 'Tu es où ?'); await B.click('#msgSend'); await B.waitForTimeout(500);
  const raw = store[store.length - 1].message;
  return !/Tu es où/.test(raw) || 'message en clair !';
});
await t('proche : il reçoit « Maman : Tu es où ? »', async () => {
  await A.evaluate("chatOwnAt = 0; chatPollOwn()"); await A.waitForTimeout(1500);
  const r = await lastIn(A); return /Maman.*Tu es où/.test(r) || r;
});
await t('proche : il répond, je reçois la réponse ; sa position n’est pas écrasée', async () => {
  await A.evaluate("chatOpenFriend(null, 'Maman'); 1"); await A.fill('#msgIn', 'Dans le E1, j’arrive'); await A.click('#msgSend'); await A.waitForTimeout(500);
  await B.evaluate("$('#msgSheet').hidden = true; chatOpen = null; pollFriends()"); await B.waitForTimeout(1500);
  const r = await B.evaluate("[(inbox[0] || {}).title + ' ' + (inbox[0] || {}).body, friends[0].last && friends[0].last.lat]");
  return (/Samuel.*Dans le E1/.test(r[0]) && r[1] === -20.9) || JSON.stringify(r);
});
[...A.errs, ...B.errs].forEach(e => fails.push('erreur JS : ' + e));
await b.close();
if (fails.length){ console.error('✗ ' + fails.length + ' problème(s) :\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ Messages depuis la carte : tout est bon.');
