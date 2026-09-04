const CACHE_NAME = 'clay-collection-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png'
];

// Installation du Service Worker et mise en cache des fichiers statiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Mise en cache des ressources PWA...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Interception des requêtes : on sert le cache si on est hors-ligne
self.addEventListener('fetch', (event) => {
  // On ignore les requêtes vers Supabase ou les API externes (TMDB, RAWG, Discogs)
  // car elles nécessitent internet et on ne veut pas les mettre en cache statique
  if (event.request.url.includes('supabase.co') || event.request.url.includes('api.')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Retourne la version en cache si elle existe, sinon va la chercher sur le réseau
      return response || fetch(event.request);
    })
  );
});

// Nettoyage des anciens caches lors d'une mise à jour de l'app (ex: v2)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Ancien cache supprimé:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});