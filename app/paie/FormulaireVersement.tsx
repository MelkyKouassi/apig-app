"use client";

import { useActionState } from "react";
import { enregistrerVersement, type EtatVersement } from "./actions";

type Option = { id: string; nom: string };
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const NOMS_MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export function FormulaireVersement({ collaborateurs, moisParDefaut }: { collaborateurs: Option[]; moisParDefaut: number }) {
  const [etat, action, enCours] = useActionState<EtatVersement, FormData>(enregistrerVersement, null);
  return (
    <form action={action} className="formulaire">
      <select name="collaborateur_id" required defaultValue="">
        <option value="" disabled>— Collaborateur —</option>
        {collaborateurs.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
      </select>
      <label>Date du versement <input name="date_versement" type="date" defaultValue={aujourdhui()} required /></label>
      <select name="mois" defaultValue={String(moisParDefaut)} required>
        {NOMS_MOIS.map((n, i) => <option key={n} value={i + 1}>Mois concerné : {n}</option>)}
      </select>
      <input name="montant" type="number" min="1" step="any" inputMode="decimal" placeholder="Montant versé (F CFA)" required />
      <button type="submit" className="secondaire" disabled={enCours}>{enCours ? "Enregistrement..." : "Enregistrer le versement"}</button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="succes">Versement enregistré.</p>}
    </form>
  );
}
