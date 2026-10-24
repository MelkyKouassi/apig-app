// Service worker APIG-PHARMA : rend l'écran de saisie utilisable hors connexion.
// Changer VERSION à chaque modification de ce fichier force la mise à jour sur les téléphones.
const VERSION = "apig-v2";
const PAGE_SAISIE = "/saisie";
const FICHIERS_FIXES = [PAGE_SAISIE, "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

// Récupère un fichier et le range dans le cache ; un échec ne bloque pas le reste.
async function mettreEnCache(cache, adresse) {
  try {
    const reponse = await fetch(adresse, { cache: "no-store" });
    if (reponse.ok) await cache.put(adresse, reponse.clone());
  } catch (erreur) {
    // Hors connexion pendant l'installation : le fichier sera pris au passage suivant.
  }
}

// Met en cache la page de saisie ET les fichiers JavaScript/CSS qu'elle utilise.
// Sans ces fichiers, la page s'ouvre hors connexion mais reste vide.
async function precharger(cache) {
  await Promise.all(FICHIERS_FIXES.map((adresse) => mettreEnCache(cache, adresse)));
  const page = await cache.match(PAGE_SAISIE);
  if (!page) return;
  const html = await page.text();
  const fichiers = [...new Set(html.match(/\/_next\/static\/[^"'\s<>)]+/g) || [])];
  await Promise.all(fichiers.map((adresse) => mettreEnCache(cache, adresse)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => precharger(cache))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // Supprime les anciens caches (apig-v1, etc.) pour ne pas garder de vieux fichiers.
  event.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((nom) => nom !== VERSION).map((nom) => caches.delete(nom))))
      .then(() => self.clients.claim())
  );
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
