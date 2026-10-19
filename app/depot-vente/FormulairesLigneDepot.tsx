"use client";

import { useActionState } from "react";
import {
  enregistrerQuantiteVendue,
  enregistrerRestitution,
  type EtatLigneDepot,
} from "./actions";

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function FormulaireRestitution({ depotId, restant }: { depotId: string; restant: number }) {
  const [etat, action, enCours] = useActionState<EtatLigneDepot, FormData>(enregistrerRestitution, null);
  return (
    <form action={action} className="annulation">
      <input type="hidden" name="depot_id" value={depotId} />
      <input name="date_restitution" type="date" defaultValue={aujourdhui()} required />
      <input name="quantite" type="number" min="1" max={restant} step="any" placeholder={`Restituée (max ${restant})`} required />
      <button type="submit" className="secondaire" disabled={enCours || restant <= 0}>
        {enCours ? "Enregistrement..." : "Enregistrer la restitution"}
      </button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="succes">Restitution enregistrée.</p>}
    </form>
  );
}

export function FormulaireQuantiteVendue({ depotId, vendue }: { depotId: string; vendue: number }) {
  const [etat, action, enCours] = useActionState<EtatLigneDepot, FormData>(enregistrerQuantiteVendue, null);
  return (
    <form action={action} className="annulation">
      <input type="hidden" name="depot_id" value={depotId} />
      <input name="quantite_vendue" type="number" min="0" step="any" defaultValue={vendue} required />
      <button type="submit" className="secondaire" disabled={enCours}>
        {enCours ? "Enregistrement..." : "Corriger la quantité vendue"}
      </button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="succes">Quantité vendue enregistrée.</p>}
    </form>
  );
}
