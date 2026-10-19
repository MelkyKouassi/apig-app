// Service worker APIG-PHARMA : rend l'écran de saisie utilisable hors connexion.
const VERSION = "apig-v1";
const PAGE_SAISIE = "/saisie";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll([PAGE_SAISIE, "/manifest.webmanifest", "/icon-192.png"]))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // Fichiers statiques de l'application : d'abord le cache, puis le réseau.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon-")) {
    event.respondWith(
      caches.match(requete).then((trouve) =>
        trouve || fetch(requete).then((reponse) => {
          const copie = reponse.clone();
          caches.open(VERSION).then((cache) => cache.put(requete, copie));
          return reponse;
        })
      )
    );
    return;
  }

  // Seule la page de saisie (sans données personnelles) est mise en cache pour le hors ligne.
  if (requete.mode === "navigate" && url.pathname === PAGE_SAISIE) {
    event.respondWith(
      fetch(requete)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(VERSION).then((cache) => cache.put(PAGE_SAISIE, copie));
          return reponse;
        })
        .catch(() => caches.match(PAGE_SAISIE))
    );
  }
});
