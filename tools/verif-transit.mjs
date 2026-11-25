// Car Jaune Live — vérification des horaires des cars jaunes avec Transit (API publique, clé gratuite).
// Une fois par jour (et à la demande) : aux grandes gares, compare les départs prévus que Transit annonce
// avec ceux des horaires officiels que l'appli utilise (GTFS Car Jaune). Rien n'est copié dans l'appli :
// on produit seulement un rapport des écarts (minutes en plus / en moins), pour repérer un horaire faux ou périmé.
//
// Usage : TRANSIT_API_KEY=… node tools/verif-transit.mjs   (Node 20, paquet fflate)
// Sortie : rapport en Markdown sur la sortie standard et dans transit-rapport.md ; code 0 même s'il y a des écarts.

import { unzipSync, strFromU8 } from 'fflate';
import { writeFileSync, appendFileSync } from 'node:fs';

const KEY = process.env.TRANSIT_API_KEY;
if (!KEY){ console.error('TRANSIT_API_KEY manquante (secret GitHub).'); process.exit(2); }
const API = 'https://external.transitapp.com/v3/public/';
const GTFS_URLS = ['https://pysae.com/api/v2/groups/car-jaune/gtfs/pub', 'https://transport.data.gouv.fr/resources/80934/download'];
const GARES = /^Gare de St-(Denis|Pierre|Paul|Benoît)$/i;   // les arrêts où presque toutes les lignes passent
const HORIZON = 3 * 3600;          // on compare les 3 prochaines heures
const TOL = 2 * 60;                // ± 2 min = même départ
const PAUSE = 7000;                // l'offre gratuite limite le nombre d'appels par minute

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { 'User-Agent': 'CarJauneLive/1.0 (+github.com/Svperman/Car-Jaune-Live)' };

function parseCsv(txt){
  if (!txt) return [];
  txt = txt.replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < txt.length; i++){
    const c = txt[i];
    if (q){ if (c === '"'){ if (txt[i + 1] === '"'){ f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ','){ row.push(f); f = ''; }
    else if (c === '\n' || c === '\r'){ if (c === '\r' && txt[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length){ row.push(f); rows.push(row); }
  const h = rows.shift().map(x => x.trim());
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, i) => [k, (r[i] || '').trim()])));
}
const secs = t => { const m = /^(\d+):(\d\d):(\d\d)$/.exec(t || ''); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };
// La Réunion : UTC+4 toute l'année
const reu = ms => { const d = new Date(ms + 4 * 3600e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: (d.getUTCDay() + 6) % 7 }; };
const ymd = o => `${o.y}${String(o.m).padStart(2, '0')}${String(o.d).padStart(2, '0')}`;
const midnight = o => Date.UTC(o.y, o.m - 1, o.d) - 4 * 3600e3;
const hm = ms => new Date(ms + 4 * 3600e3).toISOString().slice(11, 16);
const norm = s => String(s || '').toUpperCase().replace(/\s+/g, '');

async function transit(path, params){
  const u = API + path + '?' + new URLSearchParams(params);
  for (let essai = 0; essai < 3; essai++){
    const r = await fetch(u, { headers: { apiKey: KEY, ...UA } });
    if (r.status === 429){ await sleep(PAUSE * 2); continue; }
    if (!r.ok) throw new Error(`Transit ${path} : HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  throw new Error(`Transit ${path} : trop d'appels (429)`);
}

async function gtfs(){
  for (const u of GTFS_URLS){
    try { const r = await fetch(u, { redirect: 'follow', headers: UA }); if (r.ok) return unzipSync(new Uint8Array(await r.arrayBuffer())); } catch(e){}
  }
  throw new Error('horaires Car Jaune introuvables');
}

/** Départs Car Jaune (horaires officiels) de chaque gare entre maintenant et maintenant + HORIZON. */
function nosDeparts(files, now){
  const f = {}; Object.entries(files).forEach(([k, v]) => { f[k.split('/').pop()] = strFromU8(v); });
  const routes = {}; parseCsv(f['routes.txt']).forEach(r => { routes[r.route_id] = r.route_short_name || r.route_id; });
  const cal = {}; parseCsv(f['calendar.txt']).forEach(c => { cal[c.service_id] = c; });
  const ex = {}; parseCsv(f['calendar_dates.txt']).forEach(c => { (ex[c.date] = ex[c.date] || {})[c.service_id] = c.exception_type; });
  const jours = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const actif = (sid, o) => { const k = ymd(o), e = ex[k] && ex[k][sid]; if (e === '1') return true; if (e === '2') return false;
    const c = cal[sid]; return !!c && c[jours[o.wd]] === '1' && c.start_date <= k && k <= c.end_date; };
  const trips = {}; parseCsv(f['trips.txt']).forEach(t => { trips[t.trip_id] = t; });
  const gares = {}; parseCsv(f['stops.txt']).forEach(s => { if (GARES.test(s.stop_name)) (gares[s.stop_name] = gares[s.stop_name] || { ids: new Set(), lat: +s.stop_lat, lon: +s.stop_lon, dep: [] }).ids.add(s.stop_id); });
  const jourJ = reu(now), veille = reu(now - 864e5);
  const sts = parseCsv(f['stop_times.txt']), last = {};
  sts.forEach(st => { const q = +st.stop_sequence; if (!(last[st.trip_id] >= q)) last[st.trip_id] = q; });
  sts.forEach(st => {
    const g = Object.values(gares).find(x => x.ids.has(st.stop_id)); if (!g) return;
    if (+st.stop_sequence === last[st.trip_id] || st.pickup_type === '1') return;   // terminus / descente seule : pas un départ
    const t = trips[st.trip_id]; if (!t) return;
    const s = secs(st.departure_time || st.arrival_time); if (s == null) return;
    for (const o of [jourJ, veille]){                       // une course « 25:10 » d'hier compte aujourd'hui
      if (!actif(t.service_id, o)) continue;
      const ms = midnight(o) + s * 1000;
      if (ms >= now && ms <= now + HORIZON * 1000) g.dep.push({ ligne: routes[t.route_id], t: ms });
    }
  });
  return gares;
}

const now = Date.now();
const out = [];
const log = s => { out.push(s); console.log(s); };
log(`## 🚌 Horaires Car Jaune ↔ Transit — ${new Date(now + 4 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')} (heure de La Réunion)`);
log(`Départs **prévus** des 3 prochaines heures aux grandes gares ; même départ = même ligne à ± 2 min. Les retards en direct ne comptent pas.\n`);

let total = 0, communs = 0, ecarts = 0;
try {
  const gares = nosDeparts(await gtfs(), now);
  log('| Gare | Départs communs | Seulement dans Car Jaune Live | Seulement dans Transit |');
  log('|---|---|---|---|');
  const details = [];
  for (const [nom, g] of Object.entries(gares)){
    const ns = await transit('nearby_stops', { lat: g.lat, lon: g.lon, max_distance: 200 });
    await sleep(PAUSE);
    // chez Transit, une gare = plusieurs quais (un par ligne) ; on garde ceux du réseau Car Jaune (identifiants « CJFR: »)
    const ids = (ns.stops || []).filter(s => /^CJ/i.test(s.global_stop_id || '') && (s.distance == null || s.distance <= 200)).map(s => s.global_stop_id).slice(0, 12);
    if (process.env.DEBUG) console.error('DEBUG nearby', nom, JSON.stringify((ns.stops || []).slice(0, 8).map(s => [s.global_stop_id, s.stop_name, s.distance, s.route_type])));
    const leurs = [];
    for (const id of ids){
      const sd = await transit('stop_departures', { global_stop_id: id, time: Math.floor(now / 1000), remove_cancelled: 'true', should_update_realtime: 'false', max_num_departures: 30 });
      if (process.env.DEBUG) console.error('DEBUG dep', id, (sd.route_departures || []).map(r => r.route_short_name + ':' + (r.itineraries || []).map(it => (it.schedule_items || []).map(x => hm(x.departure_time * 1000)).join('/')).join('|')).join(' '));
      await sleep(PAUSE);
      (sd.route_departures || []).filter(r => /^CJ/i.test(r.global_route_id || '') || /car\s*jaune/i.test(r.route_network_name || ''))
        .forEach(r => (r.itineraries || []).forEach(it => (it.schedule_items || []).forEach(x => {
          const ts = (x.scheduled_departure_time || x.departure_time) * 1000;
          if (ts >= now && ts <= now + HORIZON * 1000 && !leurs.some(y => y.ligne === r.route_short_name && Math.abs(y.t - ts) < 30e3))
            leurs.push({ ligne: r.route_short_name, t: ts });
        })));
    }
    const pris = new Set();
    const nous = g.dep.filter((d, i, a) => a.findIndex(x => x.ligne === d.ligne && Math.abs(x.t - d.t) < 30e3) === i);
    const seulNous = [], seulEux = [];
    nous.forEach(d => {
      const j = leurs.findIndex((x, k) => !pris.has(k) && norm(x.ligne) === norm(d.ligne) && Math.abs(x.t - d.t) <= TOL * 1000);
      if (j >= 0) pris.add(j); else seulNous.push(d);
    });
    leurs.forEach((x, k) => { if (!pris.has(k)) seulEux.push(x); });
    const c = nous.length - seulNous.length;
    total += nous.length + seulEux.length; communs += c; ecarts += seulNous.length + seulEux.length;
    const fmt = l => l.length ? l.sort((a, b) => a.t - b.t).slice(0, 12).map(x => `${x.ligne} ${hm(x.t)}`).join(', ') + (l.length > 12 ? ` (+${l.length - 12})` : '') : '—';
    log(`| ${nom} | ${c} | ${fmt(seulNous)} | ${fmt(seulEux)} |`);
    if (!leurs.length && nous.length) details.push(`- ${nom} : Transit n'a renvoyé aucun départ Car Jaune (${ids.length} quai(s) trouvé(s)).`);
  }
  const taux = total ? Math.round(100 * communs / Math.max(1, communs + ecarts)) : 100;
  log(`\n**Concordance : ${taux} %** (${communs} départs identiques, ${ecarts} écarts).`);
  details.forEach(d => log(d));
  if (ecarts) log(`\nUn départ « seulement dans Car Jaune Live » peut être une course supprimée que les horaires officiels n'ont pas retirée ; « seulement dans Transit » peut venir d'horaires plus récents chez eux. Dans les deux cas, le GTFS officiel (Région Réunion / Pysae) est la référence de l'appli.`);
  writeFileSync('transit-ecarts.txt', String(taux < 90 ? ecarts : 0));
} catch(e){
  log(`\n⚠️ Vérification impossible : ${e.message}`);
  writeFileSync('transit-ecarts.txt', '0');
}
writeFileSync('transit-rapport.md', out.join('\n') + '\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');
