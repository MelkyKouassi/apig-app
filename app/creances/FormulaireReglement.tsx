"use client";

import { useActionState } from "react";
import { enregistrerReglement, type EtatReglement } from "./actions";

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function FormulaireReglement({ tiersId, reste }: { tiersId: string; reste: number }) {
  const [etat, action, enCours] = useActionState<EtatReglement, FormData>(enregistrerReglement, null);

  return (
    <form action={action} className="annulation">
      <input type="hidden" name="tiers_id" value={tiersId} />
      <input name="date_reglement" type="date" defaultValue={aujourdhui()} required />
      <input name="montant" type="number" min="1" inputMode="numeric" placeholder="Montant reçu" required />
      <button type="submit" className="secondaire" disabled={enCours}>
        {enCours ? "Enregistrement..." : "Enregistrer le règlement"}
      </button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="succes">Règlement enregistré. Reste à payer avant ce règlement : {Math.round(reste).toLocaleString("fr-FR")} F.</p>}
    </form>
  );
}
