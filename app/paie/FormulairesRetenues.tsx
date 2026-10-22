"use client";

import { useActionState } from "react";
import { ajouterRetenue, annulerRetenue, validerPaieMois, type EtatVersement } from "./actions";

type Option = { id: string; nom: string };
const NOMS_MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export function FormulaireValidation({ mois }: { mois: number }) {
  const [etat, action, enCours] = useActionState<EtatVersement, FormData>(validerPaieMois, null);
  return (
    <form action={action} className="formulaire">
      <input type="hidden" name="mois" value={mois} />
      <button type="submit" className="secondaire" disabled={enCours}>
        {enCours ? "Validation..." : `Valider la paie de ${NOMS_MOIS[mois - 1]}`}
      </button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="succes">Paie validée. Les collaborateurs peuvent voir leur bulletin.</p>}
    </form>
  );
}

export function FormulaireRetenue({ collaborateurs, moisParDefaut }: { collaborateurs: Option[]; moisParDefaut: number }) {
  const [etat, action, enCours] = useActionState<EtatVersement, FormData>(ajouterRetenue, null);
  return (
    <form action={action} className="formulaire">
      <select name="collaborateur_id" required defaultValue="">
        <option value="" disabled>— Collaborateur —</option>
        {collaborateurs.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
      </select>
      <select name="mois" defaultValue={String(moisParDefaut)} required>
        {NOMS_MOIS.map((n, i) => <option key={n} value={i + 1}>Bulletin de : {n}</option>)}
      </select>
      <input name="libelle" placeholder="Libellé (ex. avance, prêt)" required />
      <input name="montant" type="number" min="1" step="any" inputMode="decimal" placeholder="Montant de la retenue (F CFA)" required />
      <button type="submit" className="secondaire" disabled={enCours}>{enCours ? "Enregistrement..." : "Ajouter la retenue"}</button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="succes">Retenue enregistrée.</p>}
    </form>
  );
}

export function FormulaireAnnulerRetenue({ id }: { id: string }) {
  const [etat, action, enCours] = useActionState<EtatVersement, FormData>(annulerRetenue, null);
  return (
    <form action={action} className="annulation">
      <input type="hidden" name="id" value={id} />
      <input name="motif" placeholder="Motif de l'annulation (facultatif)" />
      <button type="submit" className="secondaire" disabled={enCours}>{enCours ? "..." : "Annuler la retenue"}</button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
    </form>
  );
}
