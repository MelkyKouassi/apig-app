"use client";

import { useActionState } from "react";
import { enregistrerProduction, type EtatProduction } from "./actions";

type Option = { id: string; nom: string };

export function FormulaireProduction({
  evenementId,
  produitId,
  produits,
  evenements,
  quantiteProduite,
  dons,
  stockCompte,
}: {
  evenementId?: string;
  produitId?: string;
  produits?: Option[];
  evenements?: Option[];
  quantiteProduite?: number;
  dons?: number;
  stockCompte?: number | null;
}) {
  const [etat, action, enCours] = useActionState<EtatProduction, FormData>(enregistrerProduction, null);
  const modifier = Boolean(produitId);

  return (
    <form action={action} className="annulation">
      {evenementId && <input type="hidden" name="evenement_id" value={evenementId} />}
      {produitId && <input type="hidden" name="produit_id" value={produitId} />}
      {!modifier && evenements && (
        <select name="evenement_id" required defaultValue="">
          <option value="" disabled>— Événement —</option>
          {evenements.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
      )}
      {!modifier && produits && (
        <select name="produit_id" required defaultValue="">
          <option value="" disabled>— Produit —</option>
          {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
      )}
      <input name="quantite_produite" type="number" min="0" step="any" inputMode="decimal" placeholder="Produite" defaultValue={quantiteProduite ?? ""} />
      <input name="dons" type="number" min="0" step="any" inputMode="decimal" placeholder="Dons" defaultValue={dons ?? ""} />
      <input name="stock_physique_compte" type="number" min="0" step="any" inputMode="decimal" placeholder="Stock compté" defaultValue={stockCompte ?? ""} />
      <button type="submit" className="secondaire" disabled={enCours}>
        {enCours ? "Enregistrement..." : modifier ? "Corriger" : "Ajouter"}
      </button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="succes">Enregistré.</p>}
    </form>
  );
}
