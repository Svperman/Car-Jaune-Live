// Car Jaune Live — préparation des réseaux urbains (Citalis, Kar'Ouest, Alternéo, Car'Sud, Estival).
// Télécharge les horaires officiels (GTFS, transport.data.gouv.fr) et écrit des fichiers compacts dans data/urbain/,
// lus directement par l'appli (pas besoin du serveur Apps Script pour les horaires).
// Usage : node tools/build-urban.mjs            (lancé chaque semaine par .github/workflows/urban-data.yml)
//         node tools/build-urban.mjs dossier/   (fichiers GTFS locaux <id>.zip, pour les tests)
import { unzipSync, strFromU8 } from 'fflate';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const NETS = [
  { id: 'citalis',  name: 'Citalis',   zone: 'Nord · CINOR',   color: 'E30613',
    url: 'https://www.data.gouv.fr/api/1/datasets/r/fc065c47-8644-4941-a8ca-4d8322a45749' },
  { id: 'karouest', name: 'Kar’Ouest', zone: 'Ouest · TCO',    color: '0081C6',
    url: 'https://www.data.gouv.fr/api/1/datasets/r/c9c2f609-d0cd-4233-ad1b-cf86b9bf2dc8' },
  { id: 'alterneo', name: 'Alternéo',  zone: 'Sud · CIVIS',    color: '00A3A6', rt: true,
    url: 'https://transport.data.gouv.fr/resources/80676/download' },
  { id: 'carsud',   name: 'Car’Sud',   zone: 'Sud · CASUD',    color: '7AB51D', rt: true,
    url: 'https://www.data.gouv.fr/api/1/datasets/r/8f3642e3-9fc3-45ed-af46-8c532966ace3' },
  { id: 'estival',  name: 'Estival',   zone: 'Est · CIREST',   color: 'F39200',
    url: 'https://www.data.gouv.fr/api/1/datasets/r/3b659ebb-8c17-46f4-a8ac-78c4129a4a29' }
];

/* ---------- CSV (guillemets gérés) ---------- */
function parseCsv(text){
  if (!text) return [];
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (q){
      if (c === '"'){ if (text[i + 1] === '"'){ f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ','){ row.push(f); f = ''; }
    else if (c === '\n' || c === '\r'){
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = [];
    } else f += c;
  }
  if (f !== '' || row.length){ row.push(f); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => { const o = {}; head.forEach((h, j) => o[h] = (r[j] || '').trim()); return o; });
}
const toMin = t => { if (!t) return null; const p = t.split(':'); return +p[0] * 60 + +p[1] + Math.round((+p[2] || 0) / 60); };
const r5 = v => Math.round(parseFloat(v) * 1e5) / 1e5;
// « HOTEL DE VILLE DE SAINT-DENIS » → « Hotel de Ville de Saint-Denis » (seulement les noms tout en majuscules)
const SMALL = new Set(['d', 'l', 'de', 'du', 'des', 'la', 'le', 'les', 'et', 'à', 'au', 'aux', 'en', 'sur']);
const nice = s => {
  s = (s || '').trim();
  if (!/[A-ZÀ-Ý]/.test(s) || s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/[^\s\-'’()\/]+/g, (w, i) => {
    if (i > 0 && SMALL.has(w)) return w;
    if (/^(ii|iii|iv|zac|zi|za|cfa|ces|edf|cgss|caf|chu|chor|gr|rn\d*|rd\d*)$/.test(w)) return w.toUpperCase();
    return w[0].toUpperCase() + w.slice(1);
  }).replace(/'/g, '’');
};
const hex = (c, d) => (/^[0-9a-f]{6}$/i.test((c || '').replace('#', '')) ? c.replace('#', '').toUpperCase() : d);

/* ---------- tracés : simplification + polyligne encodée (format Google, 5 décimales) ---------- */
function simplify(pts, tol){
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length){
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++){
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L));
      const ex = ax + t * dx - pts[i][0], ey = ay + t * dy - pts[i][1], d = ex * ex + ey * ey;
      if (d > md){ md = d; mi = i; }
    }
    if (md > tol * tol){ keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}
function encode(pts){
  let out = '', pa = 0, pb = 0;
  const enc = v => { v = v < 0 ? ~(v << 1) : v << 1; let s = ''; while (v >= 0x20){ s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  pts.forEach(([a, b]) => { const ia = Math.round(a * 1e5), ib = Math.round(b * 1e5); out += enc(ia - pa) + enc(ib - pb); pa = ia; pb = ib; });
  return out;
}

/* ---------- un réseau ---------- */
export function buildNet(net, zipBytes, today = new Date()){
  const files = {};
  const z = unzipSync(zipBytes);
  Object.keys(z).forEach(k => { files[k.split('/').pop()] = strFromU8(z[k]); });
  const need = ['routes.txt', 'trips.txt', 'stops.txt', 'stop_times.txt'];
  need.forEach(n => { if (!files[n]) throw new Error(net.id + ' : ' + n + ' absent du GTFS'); });

  // lignes (triées : 1, 2, 10, A…)
  const rr = parseCsv(files['routes.txt']).filter(r => !r.route_type || ['3', '700', '702', '704', '715'].includes(r.route_type) || +r.route_type < 8);
  rr.sort((a, b) => (a.route_short_name || a.route_id).localeCompare(b.route_short_name || b.route_id, 'fr', { numeric: true }));
  const routeIdx = {}, routes = [];
  rr.forEach(r => {
    routeIdx[r.route_id] = routes.length;
    const c = hex(r.route_color, net.color);
    routes.push([r.route_id, r.route_short_name || r.route_id, nice(r.route_long_name), c,
      hex(r.route_text_color, (parseInt(c.slice(0, 2), 16) * .3 + parseInt(c.slice(2, 4), 16) * .59 + parseInt(c.slice(4), 16) * .11) > 160 ? '1A1A1A' : 'FFFFFF')]);
  });

  // trajets
  const svcIdx = {}, svcs = [], heads = [], headIdx = {};
  const tripInfo = {};
  parseCsv(files['trips.txt']).forEach(t => {
    if (!(t.route_id in routeIdx)) return;
    if (!(t.service_id in svcIdx)){ svcIdx[t.service_id] = svcs.length; svcs.push(t.service_id); }
    const h = /^\d*$/.test(t.trip_headsign || '') ? '' : nice(t.trip_headsign);   // numéro de course (Car’Sud) : on prendra le terminus
    if (!(h in headIdx)){ headIdx[h] = heads.length; heads.push(h); }
    tripInfo[t.trip_id] = { r: routeIdx[t.route_id], h: headIdx[h], s: svcIdx[t.service_id], d: t.direction_id === '1' ? 1 : 0, sh: t.shape_id || '' };
  });

  // arrêts utilisés
  const allStops = {};
  parseCsv(files['stops.txt']).forEach(s => { allStops[s.stop_id] = s; });
  const seq = {};
  parseCsv(files['stop_times.txt']).forEach(st => {
    if (!tripInfo[st.trip_id]) return;
    (seq[st.trip_id] = seq[st.trip_id] || []).push([+st.stop_sequence, st.stop_id, toMin(st.departure_time || st.arrival_time), toMin(st.arrival_time || st.departure_time), st.pickup_type === '1']);
  });
  const stopIdx = {}, stops = [];
  const addStop = id => {
    if (id in stopIdx) return stopIdx[id];
    const s = allStops[id]; if (!s) return -1;
    stopIdx[id] = stops.length;
    const row = [nice(s.stop_name), r5(s.stop_lat), r5(s.stop_lon)];
    if (s.wheelchair_boarding === '1' || s.wheelchair_boarding === '2') row[3] = +s.wheelchair_boarding;
    stops.push(row);
    return stopIdx[id];
  };

  // motifs (suite d'arrêts) + profils horaires (minutes depuis le 1er départ), partagés entre courses
  const pats = [], patIdx = {}, tps = [], tpIdx = {}, trips = [], tripIds = [];
  const routeDirPats = {};   // r|d -> {pat: nombre}
  const shapeUse = {};       // r|d -> {shape: nombre}
  Object.keys(seq).forEach(tid => {
    const list = seq[tid].sort((a, b) => a[0] - b[0]).filter(x => x[2] != null || x[3] != null);
    if (list.length < 2) return;
    const sids = list.map(x => addStop(x[1]));
    if (sids.some(x => x < 0)) return;
    const pk = sids.join(',') + (list.some(x => x[4]) ? '|' + list.map(x => x[4] ? 1 : 0).join('') : '');
    if (!(pk in patIdx)){ patIdx[pk] = pats.length; pats.push(sids); }
    let t0 = list[0][2] != null ? list[0][2] : list[0][3];
    const off = list.map(x => (x[2] != null ? x[2] : x[3]) - t0);
    for (let i = 1; i < off.length; i++) if (off[i] < off[i - 1]) off[i] = off[i - 1];
    const tk = off.join(',');
    if (!(tk in tpIdx)){ tpIdx[tk] = tps.length; tps.push(off); }
    const ti = tripInfo[tid];
    trips.push([ti.r, ti.h, ti.s, patIdx[pk], tpIdx[tk], t0, ti.d]);
    if (net.rt) tripIds.push(tid);
    const k = ti.r + '|' + ti.d;
    (routeDirPats[k] = routeDirPats[k] || {})[patIdx[pk]] = (routeDirPats[k][patIdx[pk]] || 0) + 1;
    if (ti.sh) (shapeUse[k] = shapeUse[k] || {})[ti.sh] = (shapeUse[k][ti.sh] || 0) + 1;
  });
  // tri des courses par ligne puis heure (plus lisible, et compresse mieux)
  const order = trips.map((t, i) => i).sort((a, b) => trips[a][0] - trips[b][0] || trips[a][5] - trips[b][5]);
  const tripsS = order.map(i => trips[i]), tripIdsS = net.rt ? order.map(i => tripIds[i]) : undefined;

  // tracés : celui du GTFS (le plus utilisé par ligne et sens), sinon la suite d'arrêts la plus longue
  const shapePts = {};
  if (files['shapes.txt']){
    const wanted = {};
    Object.values(shapeUse).forEach(c => { wanted[Object.keys(c).sort((a, b) => c[b] - c[a])[0]] = 1; });
    parseCsv(files['shapes.txt']).forEach(p => { if (wanted[p.shape_id]) (shapePts[p.shape_id] = shapePts[p.shape_id] || []).push([+p.shape_pt_sequence, r5(p.shape_pt_lat), r5(p.shape_pt_lon)]); });
  }
  const shapes = {};
  Object.keys(routeDirPats).forEach(k => {
    const [r] = k.split('|');
    let pts = null;
    const su = shapeUse[k];
    if (su){
      const best = Object.keys(su).sort((a, b) => su[b] - su[a])[0];
      if (shapePts[best] && shapePts[best].length > 1) pts = shapePts[best].sort((a, b) => a[0] - b[0]).map(p => [p[1], p[2]]);
    }
    if (!pts){
      const c = routeDirPats[k];
      const best = Object.keys(c).sort((a, b) => pats[b].length - pats[a].length || c[b] - c[a])[0];
      pts = pats[best].map(i => [stops[i][1], stops[i][2]]);
    }
    (shapes[r] = shapes[r] || []).push(encode(simplify(pts, 0.00004)));
  });

  // calendriers (seulement ce qui reste utile : à partir d'hier)
  const iso = d => d.toISOString().slice(0, 10).replace(/-/g, '');
  const from = iso(new Date(today.getTime() - 864e5));
  const cal = {};
  parseCsv(files['calendar.txt']).forEach(c => {
    if (!(c.service_id in svcIdx) || c.end_date < from) return;
    cal[svcIdx[c.service_id]] = [[c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday, c.sunday].map(x => x === '1' ? 1 : 0).join(''), c.start_date, c.end_date];
  });
  const dates = {};
  let maxDate = '', minDate = '99999999';
  parseCsv(files['calendar_dates.txt']).forEach(d => {
    if (!(d.service_id in svcIdx) || d.date < from) return;
    const o = dates[d.date] || (dates[d.date] = [[], []]);
    o[d.exception_type === '1' ? 0 : 1].push(svcIdx[d.service_id]);
    if (d.exception_type === '1'){ if (d.date > maxDate) maxDate = d.date; if (d.date < minDate) minDate = d.date; }
  });
  Object.values(cal).forEach(c => { if (c[2] > maxDate) maxDate = c[2]; if (c[1] < minDate) minDate = c[1]; });

  let s = 90, w = 180, n = -90, e = -180;
  stops.forEach(p => { s = Math.min(s, p[1]); n = Math.max(n, p[1]); w = Math.min(w, p[2]); e = Math.max(e, p[2]); });

  const out = { v: 1, id: net.id, name: net.name, zone: net.zone, color: net.color, rt: !!net.rt,
    from: minDate, to: maxDate, bbox: [r5(s), r5(w), r5(n), r5(e)],
    routes, stops, pats, tps, trips: tripsS, heads, cal, dates, shapes };
  if (net.rt) out.tripIds = tripIdsS;
  return out;
}

/* ---------- tous les réseaux ---------- */
async function main(){
  const local = process.argv[2];
  mkdirSync('data/urbain', { recursive: true });
  const index = { builtAt: Date.now(), nets: [] };
  let prev = {};
  try { prev = JSON.parse(readFileSync('data/urbain/index.json', 'utf8')); } catch(e){}
  let ok = 0;
  for (const net of NETS){
    try {
      let bytes;
      if (local) bytes = new Uint8Array(readFileSync(local + '/' + net.id + '.zip'));
      else {
        const r = await fetch(net.url, { redirect: 'follow', headers: { 'User-Agent': 'CarJauneLive/1.0 (+github.com/Svperman/Car-Jaune-Live)' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        bytes = new Uint8Array(await r.arrayBuffer());
      }
      const d = buildNet(net, bytes);
      const json = JSON.stringify(d);
      writeFileSync(`data/urbain/${net.id}.json`, json);
      index.nets.push({ id: net.id, name: net.name, zone: net.zone, color: net.color, rt: !!net.rt, bbox: d.bbox,
        from: d.from, to: d.to, lines: d.routes.length, stops: d.stops.length, trips: d.trips.length, kb: Math.round(json.length / 1024), v: createHash('sha1').update(json).digest('hex').slice(0, 10) });
      console.log(`✓ ${net.name} : ${d.routes.length} lignes, ${d.stops.length} arrêts, ${d.trips.length} courses, ${Math.round(json.length / 1024)} Ko (${d.from} → ${d.to})`);
      ok++;
    } catch(e){
      console.log(`✗ ${net.name} : ${e.message}`);
      const old = (prev.nets || []).find(x => x.id === net.id);
      if (old && existsSync(`data/urbain/${net.id}.json`)){ index.nets.push(Object.assign(old, { err: e.message })); console.log('  → version précédente gardée'); }
    }
  }
  writeFileSync('data/urbain/index.json', JSON.stringify(index, null, 1));
  if (!ok) process.exit(1);
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
