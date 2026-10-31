"use client";

import { useActionState } from "react";
import { definirChef, validerStock, type EtatValidation } from "./actions";

export function BoutonValider({ evenementId, commercialId }: { evenementId: string; commercialId: string }) {
  const [etat, envoyer, enCours] = useActionState<EtatValidation, FormData>(validerStock, null);
  return (
    <form action={envoyer} className="validation-bouton">
      <input type="hidden" name="evenement_id" value={evenementId} />
      <input type="hidden" name="commercial_id" value={commercialId} />
      <button type="submit" className="petit" disabled={enCours}>
        {enCours ? "Validation..." : "Valider ce stock"}
      </button>
      {etat && <p className={etat.ok ? "note" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</p>}
    </form>
  );
}

export function FormulaireChef({
  evenementId,
  commerciaux,
  chefActuel,
}: {
  evenementId: string;
  commerciaux: { id: string; nom: string }[];
  chefActuel: string | null;
}) {
  const [etat, envoyer, enCours] = useActionState<EtatValidation, FormData>(definirChef, null);
  return (
    <form action={envoyer} className="formulaire">
      <input type="hidden" name="evenement_id" value={evenementId} />
      <label>
        Chef d&apos;équipe de ce lieu
        <select name="chef_id" defaultValue={chefActuel ?? ""}>
          <option value="">-- Aucun (le gérant valide) --</option>
          {commerciaux.map((c) => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="secondaire" disabled={enCours}>
        {enCours ? "Enregistrement..." : "Enregistrer le chef"}
      </button>
      {etat && <p className={etat.ok ? "note" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</p>}
    </form>
  );
}
