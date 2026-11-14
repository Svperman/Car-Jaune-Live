/* Car Jaune Live — service worker : appli utilisable hors ligne (coquille), données toujours fraîches */
const VERSION = 'cj-v51';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
  './lib/leaflet.css', './lib/leaflet.js', './lib/leaflet-rotate.js', './lib/protobuf.min.js',
  './lib/images/layers.png', './lib/images/layers-2x.png'
];

const TILE_CACHE = 'cj-tiles-v2', TILE_MAX = 4000;     // ~40 Mo maximum
let tilePuts = 0;
async function trimTiles(c){
  const keys = await c.keys();
  if (keys.length > TILE_MAX) await Promise.all(keys.slice(0, keys.length - TILE_MAX).map(k => c.delete(k)));   // les plus anciens d'abord
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== TILE_CACHE).map(k => caches.delete(k))))   // la carte hors ligne est gardée
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // carte hors ligne : chaque morceau de carte déjà vu est gardé (et rafraîchi quand il y a du réseau)
  if (/tile\.openstreetmap|basemaps\.cartocdn|arcgisonline/.test(url.host)){
    e.respondWith(caches.open(TILE_CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => {
        if (r.ok || r.type === 'opaque'){ c.put(req, r.clone()); if (++tilePuts % 50 === 0) trimTiles(c); }
        return r;
      }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // données en direct (serveur Apps Script, trafic, PDF) : jamais mises en cache ici
  if (/script\.google|googleusercontent|ntfy\.sh|tomtom\.com|geo\.api\.gouv|api-adresse\.data\.gouv/.test(url.host)) return;

  if (url.searchParams.has('maj')) return;               // vérification de mise à jour : toujours le réseau
  // page : réseau d'abord (pour recevoir les mises à jour). Si le réseau traîne (Hauts, zone blanche),
  // on ouvre tout de suite la version gardée sur le téléphone au bout de 3 s ; la nouvelle arrive
  // en arrière-plan et l'appli se met à jour toute seule juste après (icône grise).
  if (req.mode === 'navigate'){
    e.respondWith((async () => {
      const net = fetch(req.url, { cache:'no-store', credentials:'same-origin' }).then(r => {
        if (r.ok){ const copy = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); }
        return r;
      });
      e.waitUntil(net.catch(() => {}));
      const cached = await caches.match('./index.html');
      if (!cached) return net;
      const slow = new Promise(res => setTimeout(() => res(cached), 3000));
      return Promise.race([net.catch(() => cached), slow]);
    })());
    return;
  }
  // fichiers fixes (icônes, bibliothèques, polices) : cache d'abord, mis à jour en arrière-plan
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => {
      if (r.ok || r.type === 'opaque'){ const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});

// toucher une alerte rouvre l'appli
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
    for (const c of list){ if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
