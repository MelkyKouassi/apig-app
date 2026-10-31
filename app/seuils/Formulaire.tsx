"use client";

import { useActionState } from "react";
import type { EtatSeuils } from "./actions";

type Ligne = { id: string; nom: string; seuil: number | null };

export function FormulaireSeuils({
  action,
  produits,
}: {
  action: (etat: EtatSeuils, f: FormData) => Promise<EtatSeuils>;
  produits: Ligne[];
}) {
  const [etat, envoyer, enCours] = useActionState<EtatSeuils, FormData>(action, null);
  return (
    <form action={envoyer} className="formulaire">
      {produits.map((p) => (
        <label key={p.id}>
          {p.nom}
          <input
            name={`seuil_${p.id}`}
            inputMode="numeric"
            defaultValue={p.seuil ?? ""}
            placeholder="Pas d'alerte"
            aria-label={`Seuil d'alerte pour ${p.nom}`}
          />
        </label>
      ))}
      <button type="submit" disabled={enCours}>{enCours ? "Enregistrement..." : "Enregistrer mes seuils"}</button>
      {etat && <p className={etat.ok ? "note" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</p>}
    </form>
  );
}
