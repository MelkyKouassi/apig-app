"use client";

import { useActionState } from "react";
import { annulerPanier, type EtatAnnulation } from "./actions";

export function BoutonAnnuler({ panierId }: { panierId: string }) {
  const [etat, action, enCours] = useActionState<EtatAnnulation, FormData>(annulerPanier, null);

  return (
    <form action={action} className="annulation">
      <input type="hidden" name="panier_id" value={panierId} />
      <input name="motif" placeholder="Motif de l'annulation" required />
      <button type="submit" className="secondaire petit" disabled={enCours}>
        {enCours ? "Annulation..." : "Annuler cette vente"}
      </button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="succes">Vente annulée.</p>}
    </form>
  );
}
