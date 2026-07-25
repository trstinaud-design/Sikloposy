/* =========================================================================
   SIKLOPOSY — Service worker
   Objectif : l'application doit s'ouvrir et fonctionner sans aucune connexion.
   Stratégie « cache-first » : tous les fichiers sont mis en cache à
   l'installation, et servis depuis le cache ensuite. Le réseau ne sert qu'à
   rafraîchir le cache en arrière-plan.
   ========================================================================= */
const CACHE = 'sikloposy-v11';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/config.js',
  './js/store.js',
  './js/sync.js',
  './js/charts.js',
  './js/ui.js',
  './js/views.js',
  './js/views2.js',
  './js/views3.js',
  './js/app.js',
  './icons/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/bg-login.jpg',
  './icons/bg-app.jpg',
  './icons/motif-mada.svg'
];

/* Les ressources sont mises en cache une par une : si l'une d'elles venait à
   manquer, `addAll` échouerait en bloc et l'application perdrait tout son
   mode hors connexion. Un fichier absent ne doit coûter que lui-même. */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(u =>
        c.add(u).catch(err => console.warn('[SW] non mis en cache :', u, err))
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Les fichiers sont référencés avec un suffixe « ?v= » pour forcer le
   navigateur à récupérer la nouvelle version après une mise à jour. Le cache
   compare les URL query string comprise : sans `ignoreSearch`, « logo.png?v=9 »
   ne retrouverait jamais « logo.png » et l'image manquerait hors connexion. */
const OPTIONS = { ignoreSearch: true };

/* On range toujours sous l'URL sans paramètres, pour qu'une même ressource
   ne s'accumule pas en plusieurs copies au fil des versions. */
function cleDeCache(req) {
  const u = new URL(req.url);
  u.search = '';
  return u.href;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  /* Les appels au serveur de synchronisation doivent passer directement :
     s'ils échouaient, le repli sur index.html renverrait du HTML là où le
     code attend du JSON, et l'erreur réseau deviendrait indétectable. */
  if (new URL(req.url).origin !== location.origin) return;

  e.respondWith(
    caches.match(req, OPTIONS).then(hit => {
      if (hit) {
        /* Servi immédiatement depuis le cache ; on tente une mise à jour
           silencieuse pour la prochaine ouverture (sans échouer hors ligne). */
        fetch(req).then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(cleDeCache(req), res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(cleDeCache(req), copy));
          }
          return res;
        })
        /* Repli sur la page seulement pour une navigation : pour une
           ressource, mieux vaut laisser remonter l'erreur réseau. */
        .catch(err => req.mode === 'navigate'
          ? caches.match('./index.html', OPTIONS)
          : Promise.reject(err));
    })
  );
});
