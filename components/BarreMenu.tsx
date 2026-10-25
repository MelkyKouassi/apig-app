"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type Lien = { href: string; libelle: string };
export type Groupe = { titre: string; liens: Lien[] };

const DELAI_MASQUAGE_MS = 3000;

// Menu commun. Téléphone : une barre en bas, chaque rubrique s'ouvre au-dessus.
// La barre se masque après quelques secondes sans contact et revient au moindre toucher.
// Ordinateur : toutes les rubriques sont visibles dans un menu à gauche (voir globals.css).
export function BarreMenu({ groupes, directs }: { groupes: Groupe[]; directs: Lien[] }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [cachee, setCachee] = useState(false);
  const ouvertRef = useRef<string | null>(null);

  useEffect(() => {
    ouvertRef.current = ouvert;
    if (ouvert !== null) setCachee(false);
  }, [ouvert]);

  // Rubrique ouverte : le curseur ▲ ▼ est masqué, sinon il cache la liste.
  useEffect(() => {
    document.body.classList.toggle("rubrique-ouverte", ouvert !== null);
    return () => document.body.classList.remove("rubrique-ouverte");
  }, [ouvert]);

  // Masque aussi le curseur ▲ ▼ du bas, pour que les deux barres disparaissent ensemble.
  useEffect(() => {
    document.body.classList.toggle("barres-cachees", cachee);
    return () => document.body.classList.remove("barres-cachees");
  }, [cachee]);

  useEffect(() => {
    let minuterie: number | undefined;
    const reveiller = () => {
      setCachee(false);
      window.clearTimeout(minuterie);
      minuterie = window.setTimeout(() => {
        if (ouvertRef.current === null) setCachee(true);
      }, DELAI_MASQUAGE_MS);
    };
    reveiller();
    const evenements = ["touchstart", "pointerdown", "scroll"] as const;
    evenements.forEach((e) => window.addEventListener(e, reveiller, { passive: true }));
    return () => {
      window.clearTimeout(minuterie);
      evenements.forEach((e) => window.removeEventListener(e, reveiller));
    };
  }, []);

  return (
    <nav className={`barre-nav${cachee ? " cachee" : ""}`} aria-label="Navigation principale">
      <Link href="/" className="barre-accueil" onClick={() => setOuvert(null)}>Accueil</Link>

      {groupes.map((g) => (
        <div key={g.titre} className={`barre-groupe${ouvert === g.titre ? " ouvert" : ""}`}>
          <button
            type="button"
            className="barre-titre"
            aria-expanded={ouvert === g.titre}
            onClick={() => setOuvert(ouvert === g.titre ? null : g.titre)}
          >
            {g.titre}
          </button>
          <div className="barre-panneau">
            {g.liens.map((l) => (
              <Link key={l.href} href={l.href} className="barre-lien" onClick={() => setOuvert(null)}>
                {l.libelle}
              </Link>
            ))}
          </div>
        </div>
      ))}

      {directs.map((l) => (
        <Link key={l.href} href={l.href} className="barre-accueil" onClick={() => setOuvert(null)}>
          {l.libelle}
        </Link>
      ))}
    </nav>
  );
}
