"use client";

import { useActionState } from "react";
import { modifierLigne, type EtatModification } from "./actions";

type Option = { id: string; nom: string };

export function FormulaireModifierLigne({
  ligneId,
  produitId,
  quantite,
  produits,
}: {
  ligneId: string;
  produitId: string;
  quantite: number;
  produits: Option[];
}) {
  const [etat, action, enCours] = useActionState<EtatModification, FormData>(modifierLigne, null);

  return (
    <form action={action} className="modifier-ligne">
      <input type="hidden" name="ligne_id" value={ligneId} />
      <select name="produit_id" defaultValue={produitId} aria-label="Produit">
        {produits.map((p) => (
          <option key={p.id} value={p.id}>{p.nom}</option>
        ))}
      </select>
      <input name="quantite" type="number" min="1" defaultValue={quantite} inputMode="numeric" aria-label="Quantité" />
      <button type="submit" className="secondaire petit" disabled={enCours}>
        {enCours ? "..." : "Modifier"}
      </button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="succes">Ligne modifiée.</p>}
    </form>
  );
}
