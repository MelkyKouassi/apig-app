"use client";

import { useEffect, useState } from "react";

// Curseur fixe en bas de l'écran : ▲ haut, ▼ bas, et une glissière pour aller n'importe où dans la page.
export function CurseurDefilement() {
  const [position, setPosition] = useState(0);
  const [defilable, setDefilable] = useState(false);

  useEffect(() => {
    const mettreAJour = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setDefilable(max > 40);
      setPosition(max > 0 ? Math.round((window.scrollY / max) * 100) : 0);
    };
    mettreAJour();
    window.addEventListener("scroll", mettreAJour, { passive: true });
    window.addEventListener("resize", mettreAJour);
    return () => {
      window.removeEventListener("scroll", mettreAJour);
      window.removeEventListener("resize", mettreAJour);
    };
  }, []);

  if (!defilable) return null;

  const aller = (pourcent: number) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: (pourcent / 100) * max, behavior: "auto" });
  };

  return (
    <>
      <div className="curseur-espace" aria-hidden="true" />
      <div className="curseur-defilement" role="group" aria-label="Défilement de la page">
        <button type="button" onClick={() => aller(0)} aria-label="Haut de page">▲</button>
        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => aller(Number(e.target.value))}
          aria-label="Position dans la page"
        />
        <button type="button" onClick={() => aller(100)} aria-label="Bas de page">▼</button>
      </div>
    </>
  );
}
