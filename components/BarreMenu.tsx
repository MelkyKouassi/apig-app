"use client";

import Link from "next/link";
import { useState } from "react";

export type Lien = { href: string; libelle: string };
export type Groupe = { titre: string; liens: Lien[] };

// Menu commun. Téléphone : une barre en bas, chaque rubrique s'ouvre au-dessus.
// Ordinateur : toutes les rubriques sont visibles dans un menu à gauche (voir globals.css).
export function BarreMenu({ groupes, directs }: { groupes: Groupe[]; directs: Lien[] }) {
  const [ouvert, setOuvert] = useState<string | null>(null);

  return (
    <nav className="barre-nav" aria-label="Navigation principale">
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
