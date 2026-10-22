"use client";

import { useActionState } from "react";
import { validerVersement, type EtatVersement } from "./actions";

// Boutons « Accorder » et « Refuser » d'un versement saisi par le comptable (réservé au gérant).
export function FormulaireDecisionVersement({ id }: { id: string }) {
  const [etat, action, enCours] = useActionState<EtatVersement, FormData>(validerVersement, null);
  return (
    <form action={action} className="formulaire" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0" }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" name="decision" value="valider" className="secondaire" disabled={enCours}>Accorder</button>
      <button type="submit" name="decision" value="refuser" className="secondaire" disabled={enCours}>Refuser</button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
    </form>
  );
}
