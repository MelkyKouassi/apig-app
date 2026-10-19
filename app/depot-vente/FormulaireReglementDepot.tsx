"use client";

import { useActionState } from "react";
import { enregistrerReglementDepot, type EtatReglementDepot } from "./actions";

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function FormulaireReglementDepot({ tiersId, reste }: { tiersId: string; reste: number }) {
  const [etat, action, enCours] = useActionState<EtatReglementDepot, FormData>(enregistrerReglementDepot, null);

  return (
    <form action={action} className="annulation">
      <input type="hidden" name="tiers_id" value={tiersId} />
      <input name="date_reglement" type="date" defaultValue={aujourdhui()} required />
      <input name="montant" type="number" min="1" inputMode="numeric" placeholder="Montant reçu" required />
      <button type="submit" className="secondaire" disabled={enCours || reste <= 1}>
        {enCours ? "Enregistrement..." : "Enregistrer le règlement"}
      </button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="succes">Règlement enregistré.</p>}
    </form>
  );
}
