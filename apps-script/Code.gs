/**
 * Car Jaune Live — positions des cars jaunes (La Réunion) en temps réel
 * Web App Google Apps Script : le serveur récupère les flux open data
 * (GTFS statique + GTFS-RT) et la page Index.html affiche la carte.
 *
 * Données : Région Réunion / Pysae — Licence Ouverte (Etalab 2.0)
 */

// Flux temps réel (positions, retards, perturbations) — protobuf GTFS-RT
const RT_URLS = [
  'https://pysae.com/api/v2/groups/car-jaune/gtfs-rt',
  'https://www.data.gouv.fr/api/1/datasets/r/c0a17be1-e89a-48a3-aca1-d8eb8e89a55e'
];

// Horaires théoriques (lignes, arrêts, trajets, tracés) — zip GTFS
const GTFS_URLS = [
  'https://pysae.com/api/v2/groups/car-jaune/gtfs/pub',
  'https://transport.data.gouv.fr/resources/80934/download'
];

// Fiches horaires PDF officielles — source principale : site Car Jaune
const CJ_BASE = 'https://www.carjaune.re';
const CJ_INDEX = CJ_BASE + '/fr/horaires-et-fiches-lignes/23';

// Secours : fiches carjaune.re connues au 01/11/2026 (horaires à partir du 18/08)
const CJ_DEFAULT = {
  E1:  'fichehorairelignee1-e1x.pdf', E1X: 'fichehorairelignee1-e1x.pdf',
  E2:  'fichehorairelignee2.pdf',     E3:  'fiche-horaire-ligne-e3-a-partir-1808.pdf',
  O1:  'fichehoraireligneo1-o1x.pdf', O1X: 'fichehoraireligneo1-o1x.pdf',
  O2:  'fichehoraireligneo2.pdf',     O3:  'fichehoraireligneo3.pdf',
  S1:  'fichehorairelignes1.pdf',     S2:  'fichehorairelignes2.pdf',
  S3:  'fichehorairelignes3.pdf',     S4:  'fichehorairelignes4.pdf',
  S5:  'fichehorairelignes5.pdf',     S6:  'fichehorairelignes6.pdf',
  T:   'fichehorairelignet-tx.pdf',   TX:  'fichehorairelignet-tx.pdf'
};

const FICHES_PROP = 'fiches_v3';

const STATIC_TTL = 6 * 60 * 60; // 6 h (max CacheService)
const RT_TTL = 10;              // 10 s : évite de spammer le flux si plusieurs personnes ouvrent la page

/**
 * Sans paramètre : la page (Web App Apps Script).
 * Avec ?action=… : API JSON utilisée par l'appli installée sur le téléphone (PWA sur GitHub Pages).
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action) {
    let args = [];
    try { args = p.args ? JSON.parse(p.args) : []; } catch (err) { /* arguments invalides */ }
    return api_(p.action, args);
  }
  let page;
  try {
    page = HtmlService.createHtmlOutputFromFile('Index');
  } catch (err) {
    // pas de fichier Index dans le projet : l'appli est servie par GitHub Pages
    page = HtmlService.createHtmlOutput(
      '<meta http-equiv="refresh" content="0;url=' + APP_URL + '">' +
      '<p style="font-family:sans-serif">Ouverture de <a href="' + APP_URL + '" target="_top">Car Jaune Live</a>…</p>');
  }
  return page.setTitle('Car Jaune Live')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Adresse de l'appli installable (GitHub Pages)
const APP_URL = 'https://svperman.github.io/Car-Jaune-Live/';

// Envois volumineux (fiches lues) : POST avec un corps JSON {action, args}
function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { /* corps invalide */ }
  return api_(body.action, Array.isArray(body.args) ? body.args : []);
}

// Seules ces fonctions sont accessibles depuis l'extérieur (sans le paramètre « force »)
const API_ = {
  getStatic:         function () { return getStatic(); },
  getRealtime:       function () { return getRealtime(); },
  getTimetables:     function () { return getTimetables(); },
  getSchoolCalendar: function () { return getSchoolCalendar(); },
  getStopBoard:      function (ids) { return getStopBoard((ids || []).slice(0, 60).map(String)); },
  getParsedFiches:   function (urls) { return getParsedFiches((urls || []).slice(0, 60).map(String)); },
  getPdfB64:         function (url) { return getPdfB64(String(url || '')); },
  saveParsedFiche:   function (url, json) { return saveParsedFiche(String(url || ''), json); },
  setPushAlert:      function (cfg) { return setPushAlert(cfg); },
  deletePushAlert:   function (topic) { return deletePushAlert(String(topic || '')); },
  testPush:          function (topic) { return testPush(String(topic || '')); },
  pushSeen:          function (topic) { return pushSeen(String(topic || '')); }
};

function api_(action, args) {
  let out;
  try {
    if (!Object.prototype.hasOwnProperty.call(API_, action)) throw new Error('Action inconnue');
    out = { ok: true, result: API_[action].apply(null, args) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/*  Temps réel                                                         */
/* ------------------------------------------------------------------ */

/** Renvoie le flux GTFS-RT encodé en base64 (décodé ensuite dans le navigateur). */
function getRealtime() {
  const cache = CacheService.getScriptCache();
  const cached = cacheGet_(cache, 'rt');
  if (cached) return JSON.parse(cached);

  const resp = fetchFirst_(RT_URLS);
  const out = {
    b64: Utilities.base64Encode(resp.getContent()),
    fetchedAt: Date.now()
  };
  cachePut_(cache, 'rt', JSON.stringify(out), RT_TTL);
  return out;
}

/* ------------------------------------------------------------------ */
/*  Données théoriques                                                 */
/* ------------------------------------------------------------------ */

/** Lignes, trajets, arrêts et tracés simplifiés, en JSON compact. */
function getStatic(force) {
  const cache = CacheService.getScriptCache();
  if (!force) {
    const cached = cacheGet_(cache, 'static_v5');
    if (cached && cache.get(BOARD_PREFIX + 'ready')) return cached;
  }

  const resp = fetchFirst_(GTFS_URLS);
  const files = {};
  Utilities.unzip(resp.getBlob().setContentType('application/zip')).forEach(function (b) {
    files[b.getName().split('/').pop()] = b.getDataAsString('UTF-8');
  });

  const routes = {}, trips = {}, stops = {}, shapes = {};

  readCsv_(files['routes.txt']).forEach(function (r) {
    routes[r.route_id] = {
      s: r.route_short_name || r.route_id,
      l: r.route_long_name || '',
      c: (r.route_color || 'FFD200').replace('#', ''),
      t: (r.route_text_color || '1A1A1A').replace('#', '')
    };
  });

  // shape le plus utilisé par ligne + sens
  const shapeUse = {};
  const tripService = {};
  readCsv_(files['trips.txt']).forEach(function (t) {
    trips[t.trip_id] = [t.route_id, t.trip_headsign || '', t.direction_id || ''];
    tripService[t.trip_id] = t.service_id;
    if (t.shape_id) {
      const k = t.route_id + '|' + (t.direction_id || '0');
      shapeUse[k] = shapeUse[k] || {};
      shapeUse[k][t.shape_id] = (shapeUse[k][t.shape_id] || 0) + 1;
    }
  });

  readCsv_(files['stops.txt']).forEach(function (s) {
    stops[s.stop_id] = [s.stop_name, round5_(s.stop_lat), round5_(s.stop_lon)];
  });

  if (files['shapes.txt']) {
    const wanted = {}; // shape_id -> route_id
    Object.keys(shapeUse).forEach(function (k) {
      const counts = shapeUse[k];
      const best = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
      wanted[best] = k.split('|')[0];
    });

    const pts = {};
    readCsv_(files['shapes.txt']).forEach(function (p) {
      if (!(p.shape_id in wanted)) return;
      (pts[p.shape_id] = pts[p.shape_id] || []).push([+p.shape_pt_sequence, round5_(p.shape_pt_lat), round5_(p.shape_pt_lon)]);
    });

    Object.keys(pts).forEach(function (id) {
      const arr = pts[id].sort(function (a, b) { return a[0] - b[0]; });
      const step = Math.max(1, Math.ceil(arr.length / 400)); // max ~400 points par tracé
      const line = arr
        .filter(function (p, i) { return i % step === 0 || i === arr.length - 1; })
        .map(function (p) { return [p[1], p[2]]; });
      const rid = wanted[id];
      (shapes[rid] = shapes[rid] || []).push(line);
    });
  }

  const built = buildServiceHours_(files, tripService, trips);
  putBoardIndex_(cache, built.board);

  const json = JSON.stringify({ routes: routes, trips: trips, stops: stops, shapes: shapes, service: built.service,
                                routeStops: built.routeStops, builtAt: Date.now() });
  cachePut_(cache, 'static_v5', json, STATIC_TTL);
  return json;
}

/* ------------------------------------------------------------------ */
/*  Tableau des départs à l'arrêt                                      */
/* ------------------------------------------------------------------ */

const BOARD_PREFIX = 'sd4_';

/**
 * Passages prévus aux arrêts demandés : { stop_id: [[trip_id, heure (s)], ...] }
 * Le temps réel est appliqué ensuite dans le navigateur.
 */
function getStopBoard(stopIds) {
  const cache = CacheService.getScriptCache();
  if (!cache.get(BOARD_PREFIX + 'ready')) getStatic(true);   // index absent : reconstruction
  const keys = (stopIds || []).map(function (id) { return BOARD_PREFIX + id; });
  const got = keys.length ? cache.getAll(keys) : {};
  const out = {};
  (stopIds || []).forEach(function (id) {
    const v = got[BOARD_PREFIX + id];
    out[id] = v ? JSON.parse(v) : [];
  });
  return JSON.stringify(out);
}

function putBoardIndex_(cache, board) {
  try {
    const ids = Object.keys(board);
    for (let i = 0; i < ids.length; i += 80) {
      const o = {};
      ids.slice(i, i + 80).forEach(function (id) {
        const list = board[id].sort(function (a, b) { return a[1] - b[1]; });
        let s = JSON.stringify(list);
        if (s.length > 90000) s = JSON.stringify(list.slice(0, Math.floor(list.length * 90000 / s.length)));
        o[BOARD_PREFIX + id] = s;
      });
      cache.putAll(o, STATIC_TTL);
    }
    cache.put(BOARD_PREFIX + 'ready', '1', STATIC_TTL);
  } catch (e) {
    console.warn('Index des arrêts non mis en cache : ' + e.message);
  }
}

/**
 * Heures de service par calendrier GTFS :
 *  svc   : { service_id: [premier départ (s), dernière arrivée (s)] }  (peut dépasser 86400 après minuit)
 *  cal   : { service_id: ["1111100" (lun→dim), "AAAAMMJJ" début, "AAAAMMJJ" fin] }
 *  dates : { "AAAAMMJJ": { add: [service_id], rem: [service_id] } }
 */
function buildServiceHours_(files, tripService, trips) {
  // Par trajet : premier arrêt (départ) et dernier arrêt (arrivée), selon stop_sequence
  const ends = {};  // trip_id -> {s0, dep, stop0, s1, arr, stop1}
  const board = {}; // stop_id -> [[trip_id, départ (s)], ...]
  const seqs = {};  // trip_id -> [[seq, stop_id], ...]
  readCsv_(files['stop_times.txt']).forEach(function (st) {
    (seqs[st.trip_id] = seqs[st.trip_id] || []).push([+st.stop_sequence, st.stop_id]);
    const seq = +st.stop_sequence;
    const dep = toSec_(st.departure_time || st.arrival_time);
    const arr = toSec_(st.arrival_time || st.departure_time);
    if (dep == null && arr == null) return;
    const e = ends[st.trip_id] || (ends[st.trip_id] = { s0: Infinity, s1: -Infinity });
    if (seq < e.s0) { e.s0 = seq; e.dep = dep; e.stop0 = st.stop_id; }
    if (seq > e.s1) { e.s1 = seq; e.arr = arr; e.stop1 = st.stop_id; }
    if (st.pickup_type !== '1') (board[st.stop_id] = board[st.stop_id] || []).push([st.trip_id, dep != null ? dep : arr]);
  });

  // trips[id] = [route, headsign, direction, départ(s), arrivée(s), arrêt départ, arrêt arrivée, service_id]
  const tripSpan = {};
  Object.keys(trips).forEach(function (tid) {
    const t = trips[tid], e = ends[tid];
    t[3] = e ? e.dep : null; t[4] = e ? e.arr : null;
    t[5] = e ? e.stop0 : ''; t[6] = e ? e.stop1 : '';
    t[7] = tripService[tid] || '';
    if (e) tripSpan[tid] = [e.dep, e.arr];
  });

  const svc = {};
  Object.keys(tripSpan).forEach(function (tid) {
    const sid = tripService[tid];
    if (!sid) return;
    const sp = tripSpan[tid];
    const cur = svc[sid] || (svc[sid] = [Infinity, -Infinity]);
    if (sp[0] < cur[0]) cur[0] = sp[0];
    if (sp[1] > cur[1]) cur[1] = sp[1];
  });

  const cal = {};
  readCsv_(files['calendar.txt']).forEach(function (c) {
    cal[c.service_id] = [
      [c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday, c.sunday].map(function (x) { return x === '1' ? '1' : '0'; }).join(''),
      c.start_date, c.end_date
    ];
  });

  const dates = {};
  readCsv_(files['calendar_dates.txt']).forEach(function (d) {
    const o = dates[d.date] || (dates[d.date] = { add: [], rem: [] });
    (d.exception_type === '1' ? o.add : o.rem).push(d.service_id);
  });

  // Arrêts de chaque ligne dans l'ordre : le trajet le plus long de chaque sens
  // routeStops[route_id] = [[stop_id, ...] (sens 0), [stop_id, ...] (sens 1)]
  const best = {};
  Object.keys(seqs).forEach(function (tid) {
    const t = trips[tid];
    if (!t) return;
    const k = t[0] + '|' + (t[2] || '0');
    if (!best[k] || seqs[tid].length > best[k].length) best[k] = seqs[tid];
  });
  const routeStops = {};
  Object.keys(best).forEach(function (k) {
    const parts = k.split('|');
    const list = best[k].sort(function (a, b) { return a[0] - b[0]; }).map(function (x) { return x[1]; });
    (routeStops[parts[0]] = routeStops[parts[0]] || [])[parts[1] === '1' ? 1 : 0] = list;
  });

  return { service: { svc: svc, cal: cal, dates: dates }, board: board, routeStops: routeStops };
}

/* ------------------------------------------------------------------ */
/*  Lecture des fiches PDF (faite dans le navigateur, gardée ici)      */
/* ------------------------------------------------------------------ */

const PDF_OK = /^https:\/\/(www\.carjaune\.re|static\.reu3\.cityway\.fr)\/ftp\/documents_CARJAUNE\/[\w.\-]+\.pdf$/i;
const FP_PREFIX = 'fp3_';

/** Renvoie le PDF d'une fiche carjaune.re en base64 (le navigateur ne peut pas le télécharger lui-même). */
function getPdfB64(url) {
  if (!PDF_OK.test(url)) throw new Error('Adresse de fiche non autorisée');
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw new Error('Fiche indisponible (HTTP ' + r.getResponseCode() + ')');
  return Utilities.base64Encode(r.getContent());
}

/** Horaires déjà extraits des fiches : { url: {v, tables} } (seulement pour les URL demandées). */
function getParsedFiches(urls) {
  const all = PropertiesService.getScriptProperties().getProperties();   // une seule lecture
  const out = {};
  (urls || []).forEach(function (url) {
    const s = propGet_(all, FP_PREFIX + hash_(url));
    if (s) out[url] = JSON.parse(s);
  });
  return JSON.stringify(out);
}

/** Enregistre les horaires extraits d'une fiche par le navigateur. */
function saveParsedFiche(url, json) {
  if (!PDF_OK.test(url)) throw new Error('Adresse de fiche non autorisée');
  if (typeof json !== 'string' || json.length > 150000) throw new Error('Données trop volumineuses');
  const o = JSON.parse(json);
  if (!o || !Array.isArray(o.tables)) throw new Error('Format invalide');
  propPut_(PropertiesService.getScriptProperties(), FP_PREFIX + hash_(url), json);
  return true;
}

// Pour relire toutes les fiches (après un changement de mise en page par exemple)
function resetParsedFiches() {
  const props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).forEach(function (k) { if (k.indexOf(FP_PREFIX) === 0) props.deleteProperty(k); });
}

function hash_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s)).replace(/=+$/, '');
}
// PropertiesService limite chaque valeur à 9 Ko : découpage en morceaux
function propPut_(props, key, str) {
  const size = 8000, n = Math.ceil(str.length / size), o = {};
  o[key + '_n'] = String(n);
  for (let i = 0; i < n; i++) o[key + '_' + i] = str.substr(i * size, size);
  props.setProperties(o);
}
function propGet_(all, key) {
  const n = +all[key + '_n'];
  if (!n) return null;
  let s = '';
  for (let i = 0; i < n; i++) {
    const part = all[key + '_' + i];
    if (part == null) return null;
    s += part;
  }
  return s;
}

function toSec_(t) {
  if (!t) return null;
  const p = t.split(':');
  if (p.length < 2) return null;
  return (+p[0]) * 3600 + (+p[1]) * 60 + (+(p[2] || 0));
}

/* ------------------------------------------------------------------ */
/*  Fiches horaires PDF (mise à jour automatique, 1 fois / 24 h)       */
/* ------------------------------------------------------------------ */

/**
 * Renvoie { lines: { "E1": {name, pdfs:[{url,label}]}, ... }, source, checkedAt }
 * Uniquement les fiches PDF du site Car Jaune (www.carjaune.re) :
 *   1. lecture automatique du site (nouvelles fiches et horaires exceptionnels inclus)
 *   2. sinon dernière version lue, puis liste intégrée CJ_DEFAULT
 * Le résultat est gardé 24 h (PropertiesService).
 */
function getTimetables(force) {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty(FICHES_PROP);
  if (saved && !force) {
    const o = JSON.parse(saved);
    if (Date.now() - o.checkedAt < 24 * 3600 * 1000) return saved;
  }
  try {
    const json = JSON.stringify({ lines: scrapeCarJaune_(), source: 'carjaune', checkedAt: Date.now() });
    props.setProperty(FICHES_PROP, json);
    return json;
  } catch (e) {
    console.warn('Fiches horaires carjaune.re : ' + e.message);
  }
  if (saved) return saved;                // dernière version lue sur le site
  return JSON.stringify({ lines: defaultLines_(), source: 'defaut', checkedAt: Date.now(), unchecked: true });
}

/** Lit la page « Horaires et Fiches Lignes » puis chaque page de ligne pour récupérer ses PDF. */
function scrapeCarJaune_() {
  const html = fetchFirst_([CJ_INDEX]).getContentText();
  const re = /<a[^>]+href="([^"]*\/RouteSchedules\/[^"]+)"[^>]*title="Horaires de la ligne ([^"]+)"/gi;
  const lines = {};
  let m;
  while ((m = re.exec(html)) !== null) {
    const short = m[2].trim();
    if (!lines[short]) lines[short] = { page: absCj_(m[1].replace(/&amp;/g, '&')), pdfs: [] };
  }
  const shorts = Object.keys(lines);
  if (!shorts.length) throw new Error('aucune ligne trouvée sur carjaune.re');

  const res = UrlFetchApp.fetchAll(shorts.map(function (s) {
    return { url: lines[s].page, muteHttpExceptions: true, followRedirects: true };
  }));
  const pdfRe = /<a[^>]+href="([^"]*documents_CARJAUNE\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
  let found = 0;
  res.forEach(function (r, i) {
    if (r.getResponseCode() !== 200) return;
    const page = r.getContentText();
    const seen = {};
    let p;
    pdfRe.lastIndex = 0;
    while ((p = pdfRe.exec(page)) !== null) {
      const url = absCj_(p[1]);
      if (seen[url]) continue;
      seen[url] = true;
      lines[shorts[i]].pdfs.push({ url: url, label: cleanPdfLabel_(p[2]) });
      found++;
    }
  });
  if (!found) throw new Error('aucune fiche PDF trouvée sur carjaune.re');

  const names = routeNames_();
  shorts.forEach(function (s) {
    lines[s].name = names[s] || '';
    delete lines[s].page;                 // seules les fiches PDF sont affichées
    if (!lines[s].pdfs.length && CJ_DEFAULT[s]) {
      lines[s].pdfs.push({ url: CJ_BASE + '/ftp/documents_CARJAUNE/' + CJ_DEFAULT[s], label: 'Fiche horaire' });
    }
  });
  return lines;
}

function defaultLines_() {
  const names = routeNames_(), out = {};
  Object.keys(CJ_DEFAULT).forEach(function (s) {
    out[s] = {
      name: names[s] || '',
      pdfs: [{ url: CJ_BASE + '/ftp/documents_CARJAUNE/' + CJ_DEFAULT[s], label: 'Fiche horaire · dès le 18/08' }]
    };
  });
  return out;
}

/** Nom long de chaque ligne (GTFS), ex. "E1" -> "St-Denis / St-Benoît". */
function routeNames_() {
  const out = {};
  try {
    const st = JSON.parse(getStatic());
    Object.keys(st.routes).forEach(function (rid) { out[st.routes[rid].s] = st.routes[rid].l; });
  } catch (e) { /* GTFS indisponible */ }
  return out;
}

function absCj_(u) { return /^https?:/i.test(u) ? u : CJ_BASE + (u.charAt(0) === '/' ? '' : '/') + u; }

/** "FichehoraireligneE2 à partir du 18/08 Nouvelle fenêtre (Document Acrobat…" → "Fiche horaire · dès le 18/08" */
function cleanPdfLabel_(raw) {
  let t = String(raw).replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ')
    .replace(/Nouvelle fen[êe]tre.*$/i, '').replace(/\(Document.*$/i, '').trim();
  const date = (t.match(/(?:à|a) partir (?:du |de )?(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i) || [])[1];
  const exc = /exceptionnel|gr[èe]ve|f[ée]ri|dimanche|samedi|vacances|travaux/i.test(t);
  if (exc) return t.slice(0, 60);
  return 'Fiche horaire' + (date ? ' · dès le ' + date : '');
}

// À lancer à la main depuis l'éditeur pour forcer la mise à jour des fiches
function refreshTimetables() {
  const o = JSON.parse(getTimetables(true));
  console.log(Object.keys(o.lines).length + ' lignes (source : ' + o.source + ') : ' + JSON.stringify(o.lines, null, 1));
}

/* ------------------------------------------------------------------ */
/*  Calendrier scolaire & jours fériés de La Réunion                   */
/* ------------------------------------------------------------------ */

const SCHOOL_API = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';
const FERIES_API = 'https://calendrier.api.gouv.fr/jours-feries/la-reunion/';
const SCHOOL_PROP = 'calendrier_v1';

// Secours si les API ne répondent pas : calendrier 2026-2027 (zone Réunion), fin = jour de reprise
const SCHOOL_DEFAULT = [
  { name: "Vacances d'Hiver austral",     start: '2026-07-04', end: '2026-08-18' },
  { name: 'Vacances après 1ère période', start: '2026-10-10', end: '2026-10-26' },
  { name: "Vacances d'Été austral",       start: '2026-12-19', end: '2027-02-01' },
  { name: 'Vacances après 3ème période', start: '2027-03-16', end: '2027-03-30' },
  { name: 'Vacances après 4ème période', start: '2027-05-05', end: '2027-05-19' },
  { name: "Vacances d'Hiver austral",     start: '2027-07-03', end: '2027-08-17' }
];

/**
 * { holidays: [{name, start, end}], feries: {"AAAA-MM-JJ": "nom"}, source, checkedAt }
 * start = 1er jour de vacances, end = jour de reprise (exclu). Mis à jour automatiquement chaque semaine.
 */
function getSchoolCalendar(force) {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty(SCHOOL_PROP);
  if (saved && !force) {
    const o = JSON.parse(saved);
    if (Date.now() - o.checkedAt < 7 * 24 * 3600 * 1000) return saved;
  }

  const out = { holidays: [], feries: {}, source: 'api', checkedAt: Date.now() };
  try {
    const since = Utilities.formatDate(new Date(Date.now() - 400 * 864e5), 'Indian/Reunion', 'yyyy-MM-dd');
    const url = SCHOOL_API + '?limit=100&order_by=start_date&where=' +
      encodeURIComponent('location="Réunion" and end_date >= "' + since + '"');
    const recs = JSON.parse(fetchFirst_([url]).getContentText()).results || [];
    const seen = {};
    recs.forEach(function (r) {
      if (/enseignant/i.test(r.population || '')) return;          // on garde le calendrier des élèves
      const start = parisDay_(r.start_date);
      let end = parisDay_(r.end_date);
      if (!start || !/vacances/i.test(r.description || '')) return;
      if (end <= start) end = addDays_(start, 45);                   // « Début des vacances… » sans date de fin
      const k = start + end;
      if (seen[k]) return;
      seen[k] = true;
      out.holidays.push({ name: String(r.description).replace(/^Début des /i, ''), start: start, end: end });
    });
    if (!out.holidays.length) throw new Error('aucune période trouvée');
  } catch (e) {
    console.warn('Calendrier scolaire : ' + e.message);
    out.holidays = SCHOOL_DEFAULT;
    out.source = 'defaut';
  }

  const y = +Utilities.formatDate(new Date(), 'Indian/Reunion', 'yyyy');
  [y - 1, y, y + 1].forEach(function (yr) {
    try {
      const f = JSON.parse(fetchFirst_([FERIES_API + yr + '.json']).getContentText());
      Object.keys(f).forEach(function (d) { out.feries[d] = f[d]; });
    } catch (e) { console.warn('Jours fériés ' + yr + ' : ' + e.message); }
  });

  const json = JSON.stringify(out);
  if (out.source === 'api') props.setProperty(SCHOOL_PROP, json);
  else if (saved) return saved;
  return json;
}

// "2026-10-09T22:00:00+00:00" (minuit heure de Paris) -> "2026-10-10"
function parisDay_(iso) {
  if (!iso) return '';
  return Utilities.formatDate(new Date(iso), 'Europe/Paris', 'yyyy-MM-dd');
}
function addDays_(day, n) {
  return Utilities.formatDate(new Date(Date.parse(day + 'T12:00:00Z') + n * 864e5), 'UTC', 'yyyy-MM-dd');
}

// À lancer à la main pour voir le calendrier utilisé
function refreshSchoolCalendar() {
  console.log(getSchoolCalendar(true));
}

/* ------------------------------------------------------------------ */
/*  Outils                                                             */
/* ------------------------------------------------------------------ */

function fetchFirst_(urls) {
  let lastErr = '';
  for (let i = 0; i < urls.length; i++) {
    try {
      const r = UrlFetchApp.fetch(urls[i], { muteHttpExceptions: true, followRedirects: true });
      if (r.getResponseCode() === 200) return r;
      lastErr = 'HTTP ' + r.getResponseCode() + ' sur ' + urls[i];
    } catch (e) {
      lastErr = e.message;
    }
  }
  throw new Error('Flux indisponible (' + lastErr + ')');
}

function readCsv_(text) {
  if (!text) return [];
  const rows = Utilities.parseCsv(text.replace(/^﻿/, ''));
  if (!rows.length) return [];
  const head = rows[0].map(function (h) { return h.trim(); });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue;
    const o = {};
    for (let j = 0; j < head.length; j++) o[head[j]] = row[j] !== undefined ? row[j].trim() : '';
    out.push(o);
  }
  return out;
}

function round5_(v) { return Math.round(parseFloat(v) * 1e5) / 1e5; }

// CacheService limite chaque valeur à 100 Ko : on découpe en morceaux
function cachePut_(cache, key, str, ttl) {
  try {
    const size = 45000;
    const n = Math.ceil(str.length / size);
    const o = {};
    o[key + '_n'] = String(n);
    for (let i = 0; i < n; i++) o[key + '_' + i] = str.substr(i * size, size);
    cache.putAll(o, ttl);
  } catch (e) {
    console.warn('Cache non écrit : ' + e.message);
  }
}

function cacheGet_(cache, key) {
  try {
    const n = +cache.get(key + '_n');
    if (!n) return null;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(key + '_' + i);
    const got = cache.getAll(keys);
    let s = '';
    for (let i = 0; i < keys.length; i++) {
      if (got[keys[i]] == null) return null;
      s += got[keys[i]];
    }
    return s;
  } catch (e) {
    return null;
  }
}


/* ------------------------------------------------------------------ */
/*  Alertes appli fermée : le serveur surveille ton arrêt et envoie    */
/*  la notification par ntfy, même téléphone verrouillé.               */
/*  Un déclencheur toutes les minutes, qui ne travaille que pendant    */
/*  tes créneaux (aller / retour) : le reste du temps il s'arrête net. */
/* ------------------------------------------------------------------ */

const PUSH_PREFIX = 'push_';
const NTFY_TOPIC = /^[A-Za-z0-9_-]{6,64}$/;

function pushId_(topic) { return hash_('push|' + topic).replace(/[^A-Za-z0-9]/g, '').slice(0, 16); }

/** Enregistre (ou remplace) l'alerte d'un téléphone. cfg = { topic, lead, lines[], quai, windows:[{days[1..7], from, to, fromIds[], toIds[], fromName, toName}] } */
function setPushAlert(cfg) {
  cfg = typeof cfg === 'string' ? JSON.parse(cfg) : cfg;
  if (!cfg || !NTFY_TOPIC.test(cfg.topic || '')) throw new Error('canal ntfy invalide');
  const hm = function (s) { return /^\d{2}:\d{2}$/.test(s || '') ? s : null; };
  const ids = function (a) { return (a || []).slice(0, 40).map(String); };
  const clean = {
    topic: cfg.topic,
    lead: Math.max(1, Math.min(30, +cfg.lead || 5)),
    lines: (cfg.lines || []).slice(0, 30).map(String),
    quai: cfg.quai !== false,
    windows: (cfg.windows || []).slice(0, 4).map(function (w) {
      return { days: (w.days || []).map(Number).filter(function (d) { return d >= 1 && d <= 7; }),
               from: hm(w.from), to: hm(w.to), fromIds: ids(w.fromIds), toIds: ids(w.toIds),
               fromName: String(w.fromName || '').slice(0, 60), toName: String(w.toName || '').slice(0, 60) };
    }).filter(function (w) { return w.from && w.to && w.days.length && w.fromIds.length; }),
    muteUntil: +cfg.muteUntil || 0,
    savedAt: Date.now()
  };
  if (!clean.windows.length) throw new Error('aucun créneau valide');
  PropertiesService.getScriptProperties().setProperty(PUSH_PREFIX + pushId_(clean.topic), JSON.stringify(clean));
  const trig = ensurePushTrigger_();
  return JSON.stringify({ ok: true, trigger: trig });
}

function deletePushAlert(topic) {
  if (!NTFY_TOPIC.test(topic)) throw new Error('canal ntfy invalide');
  PropertiesService.getScriptProperties().deleteProperty(PUSH_PREFIX + pushId_(topic));
  return JSON.stringify({ ok: true });
}

/** L'appli est ouverte à l'écran : le serveur se tait 3 min (pas de notification en double). */
function pushSeen(topic) {
  if (!NTFY_TOPIC.test(topic)) return '0';
  CacheService.getScriptCache().put('pseen_' + pushId_(topic), '1', 180);
  return '1';
}

function testPush(topic) {
  if (!NTFY_TOPIC.test(topic)) throw new Error('canal ntfy invalide');
  ntfySend_(topic, '🧪 Test du serveur Car Jaune', 'Ton serveur peut te prévenir même quand l’appli est fermée.', 3);
  return JSON.stringify({ ok: true, trigger: ensurePushTrigger_() });
}

function ensurePushTrigger_() {
  try {
    const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'pushTick'; });
    if (!has) ScriptApp.newTrigger('pushTick').timeBased().everyMinutes(1).create();
    return true;
  } catch (e) {
    return false;   // autorisation manquante : exécuter installPushTrigger une fois dans l'éditeur
  }
}

/** À exécuter UNE fois dans l'éditeur Apps Script (▶ Exécuter) pour autoriser les déclencheurs. */
function installPushTrigger() { Logger.log(ensurePushTrigger_() ? 'Déclencheur pushTick actif.' : 'Échec : autorise le script.'); }

function ntfySend_(topic, title, message, priority) {
  UrlFetchApp.fetch('https://ntfy.sh/', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ topic: topic, title: title, message: message, priority: priority || 4, tags: ['bus'] })
  });
}

/** Lancé chaque minute par le déclencheur. */
function pushTick() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const cfgs = Object.keys(all).filter(function (k) { return k.indexOf(PUSH_PREFIX) === 0; })
    .map(function (k) { try { return JSON.parse(all[k]); } catch (e) { return null; } }).filter(Boolean);
  if (!cfgs.length) return;

  const now = new Date();
  const p = Utilities.formatDate(now, 'Indian/Reunion', 'u|HH|mm|ss|yyyyMMdd').split('|');
  const wd = +p[0], hmNow = p[1] + ':' + p[2], ymd = p[4];
  const midnight = now.getTime() - ((+p[1]) * 3600 + (+p[2]) * 60 + (+p[3])) * 1000;
  const cache = CacheService.getScriptCache();

  // créneaux actifs maintenant (élargis de l'avance demandée)
  const work = [];
  cfgs.forEach(function (c) {
    if (cache.get('pseen_' + pushId_(c.topic))) return;           // appli ouverte : elle s'en charge
    if (c.muteUntil && c.muteUntil > now.getTime()) return;      // notifications en pause
    c.windows.forEach(function (w) {
      if (w.days.indexOf(wd) < 0) return;
      if (hmNow >= addMin_(w.from, -c.lead) && hmNow <= w.to) work.push({ c: c, w: w });
    });
  });
  if (!work.length) return;

  // Liste des départs du jour, calculée une seule fois par jour et par créneau (gardée en cache) :
  // chaque minute, on ne fait que la parcourir — le flux temps réel n'est lu que si un car approche.
  let S = null, active, rt = null;
  const nowMs = now.getTime();
  work.forEach(function (job, wi) {
    const c = job.c, w = job.w;
    const dkey = 'pday_' + pushId_(c.topic) + '_' + ymd + '_' + c.windows.indexOf(w) + '_' + hash_(JSON.stringify(w)).slice(0, 8);
    let list = null;
    try { list = JSON.parse(cache.get(dkey) || 'null'); } catch (e) {}
    if (!list) {
      if (!S) { S = JSON.parse(getStatic()); active = activeServices_(S.service, ymd, wd); }
      const boards = JSON.parse(getStopBoard(w.fromIds.concat(w.toIds).slice(0, 60)));
      const toSec = {};
      w.toIds.forEach(function (id) { (boards[id] || []).forEach(function (r) { toSec[r[0]] = Math.max(toSec[r[0]] || 0, r[1]); }); });
      list = [];
      w.fromIds.forEach(function (sid) {
        (boards[sid] || []).forEach(function (r) {
          const tid = r[0], sec = r[1], t = S.trips[tid];
          if (!t || (active && !active[t[7]])) return;
          if (t[6] === sid) return;                                   // terminus : pas un départ
          if (w.toIds.length && !(toSec[tid] > sec)) return;          // ne va pas vers ma destination
          const route = S.routes[t[0]] || { s: '?' };
          if (c.lines.length && c.lines.indexOf(route.s) < 0) return;
          list.push([tid, sid, sec, route.s, w.toName || t[1] || '']);
        });
      });
      try { cache.put(dkey, JSON.stringify(list), 6 * 3600); } catch (e) {}
    }
    list.forEach(function (d) {
      const tid = d[0], sid = d[1], sched = midnight + d[2] * 1000;
      if (sched < nowMs - 20 * 60e3 || sched > nowMs + (c.lead + 25) * 60e3) return;   // loin : rien à faire
      if (rt === null) { rt = {}; try { rt = decodeTripUpdates_(Utilities.base64Decode(getRealtime().b64)); } catch (e) { console.warn('RT : ' + e.message); } }
      const tu = rt[tid];
      const delay = tu ? stopDelay_(tu, sid) : null;
      const eff = sched + (delay || 0) * 1000;
      const mins = (eff - nowMs) / 60000;
      const hm = Utilities.formatDate(new Date(eff), 'Indian/Reunion', 'HH:mm');
      const lateTxt = delay == null ? 'horaire prévu' : Math.abs(delay) < 60 ? 'à l’heure' : (delay > 0 ? 'retard ' : 'avance ') + Math.round(Math.abs(delay) / 60) + ' min';
      const send = function (kind, title, body, prio) {
        const key = 'psent_' + pushId_(c.topic) + '_' + kind + '_' + tid + '_' + ymd;
        if (cache.get(key)) return;
        cache.put(key, '1', 6 * 3600);
        ntfySend_(c.topic, title, body, prio);
      };
      if (mins <= c.lead + 0.75 && mins > c.lead - 1.5)
        send('lead', '🚌 ' + d[3] + ' → ' + d[4] + ' dans ' + Math.max(1, Math.round(mins)) + ' min',
             'Départ de ' + (w.fromName || 'ton arrêt') + ' à ' + hm + ' (' + lateTxt + ').', 4);
      if (c.quai && tu && mins <= 1 && mins > -1.5)
        send('quai', '🚏 ' + d[3] + ' arrive à quai', (w.fromName || 'Ton arrêt') + ' · ' + hm + ' (' + lateTxt + ').', 5);
    });
  });
}

function addMin_(hm, m) {
  const t = (+hm.slice(0, 2)) * 60 + (+hm.slice(3)) + m;
  const c = Math.max(0, Math.min(24 * 60 - 1, t));
  return ('0' + Math.floor(c / 60)).slice(-2) + ':' + ('0' + (c % 60)).slice(-2);
}

/** Services qui circulent ce jour-là (null si le calendrier est inconnu). */
function activeServices_(sv, ymd, wd) {
  if (!sv || !sv.cal) return null;
  const out = {};
  Object.keys(sv.cal).forEach(function (sid) {
    const c = sv.cal[sid];
    if (c[1] <= ymd && ymd <= c[2] && c[0].charAt(wd - 1) === '1') out[sid] = true;
  });
  const ex = (sv.dates || {})[ymd];
  if (ex) { ex.add.forEach(function (s) { out[s] = true; }); ex.rem.forEach(function (s) { delete out[s]; }); }
  return Object.keys(out).length || ex ? out : null;
}

/** Retard (s) du car à un arrêt : celui de l'arrêt, sinon du dernier arrêt connu avant, sinon du trajet. */
function stopDelay_(tu, stopId) {
  const s = tu.stops.filter(function (x) { return x.stopId === stopId; })[0] || tu.stops[0];
  if (s && s.delay != null) return s.delay;
  return tu.delay != null ? tu.delay : null;
}

/* ---- lecture minimale du flux GTFS-RT (protobuf) : retards des trajets ---- */
function decodeTripUpdates_(bytes) {
  const b = bytes.map(function (x) { return x & 255; });
  const out = {};
  pbEach_(b, 0, b.length, function (f, wt, v) {                       // FeedMessage
    if (f !== 2 || wt !== 2) return;
    pbEach_(b, v.s, v.e, function (f2, wt2, v2) {                      // FeedEntity
      if (f2 !== 3 || wt2 !== 2) return;
      const tu = { tripId: '', stops: [], delay: null };
      pbEach_(b, v2.s, v2.e, function (f3, wt3, v3) {                  // TripUpdate
        if (f3 === 1 && wt3 === 2) pbEach_(b, v3.s, v3.e, function (f4, wt4, v4) { if (f4 === 1 && wt4 === 2) tu.tripId = pbStr_(b, v4); });
        else if (f3 === 5 && wt3 === 0) tu.delay = pbInt_(v3);
        else if (f3 === 2 && wt3 === 2) {
          const st = { stopId: '', delay: null };
          pbEach_(b, v3.s, v3.e, function (f4, wt4, v4) {               // StopTimeUpdate
            if (f4 === 4 && wt4 === 2) st.stopId = pbStr_(b, v4);
            else if ((f4 === 2 || f4 === 3) && wt4 === 2) pbEach_(b, v4.s, v4.e, function (f5, wt5, v5) {
              if (f5 === 1 && wt5 === 0 && (st.delay == null || f4 === 3)) st.delay = pbInt_(v5);
            });
          });
          tu.stops.push(st);
        }
      });
      if (tu.tripId) out[tu.tripId] = tu;
    });
  });
  return out;
}
function pbEach_(b, i, end, cb) {
  while (i < end) {
    const key = pbVar_(b, i); i = key.i;
    const f = Number(key.v >> 3n), wt = Number(key.v & 7n);
    if (wt === 0) { const r = pbVar_(b, i); i = r.i; cb(f, wt, r.v); }
    else if (wt === 2) { const r = pbVar_(b, i); const len = Number(r.v); cb(f, wt, { s: r.i, e: r.i + len }); i = r.i + len; }
    else if (wt === 1) i += 8;
    else if (wt === 5) i += 4;
    else break;
  }
}
function pbVar_(b, i) {
  let v = 0n, shift = 0n;
  while (i < b.length) {
    const x = b[i++];
    v |= BigInt(x & 127) << shift;
    if (!(x & 128)) break;
    shift += 7n;
  }
  return { v: v, i: i };
}
function pbInt_(v) { return Number(BigInt.asIntN(64, v)); }
function pbStr_(b, r) { return Utilities.newBlob(b.slice(r.s, r.e).map(function (x) { return x > 127 ? x - 256 : x; })).getDataAsString('UTF-8'); }
