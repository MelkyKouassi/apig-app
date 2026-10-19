"use client";

import { useEffect } from "react";

// Enregistre le service worker (fonctionnement hors connexion de l'écran de saisie).
export function EnregistrerSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
