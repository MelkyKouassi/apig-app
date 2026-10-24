"use client";

import { useState } from "react";

// Bouton loupe : ouvre une zone de recherche qui ne garde que les cartes contenant le texte saisi.
// Les cartes sont celles de la page (section.carte-vente) ; rien n'est envoyé au serveur.
export function RechercheLoupe({ placeholder = "Nom, produit, événement…" }: { placeholder?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState("");

  function filtrer(valeur: string) {
    setTexte(valeur);
    const cherche = valeur.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>("main section.carte-vente").forEach((carte) => {
      const correspond = !cherche || (carte.textContent ?? "").toLowerCase().includes(cherche);
      carte.style.display = correspond ? "" : "none";
    });
  }

  return (
    <div className="recherche">
      <button
        type="button"
        className="secondaire petit"
        aria-label="Rechercher"
        aria-expanded={ouvert}
        onClick={() => {
          if (ouvert) filtrer("");
          setOuvert(!ouvert);
        }}
      >
        🔍
      </button>
      {ouvert && (
        <input
          type="search"
          value={texte}
          onChange={(e) => filtrer(e.target.value)}
          placeholder={placeholder}
          autoFocus
          aria-label="Rechercher dans la liste"
        />
      )}
    </div>
  );
}
