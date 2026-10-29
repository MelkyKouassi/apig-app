"use client";

import { useActionState } from "react";
import { ajouterDepense, annulerDepense, type EtatDepense } from "./actions";
import { CATEGORIES } from "./categories";

type Lieu = { id: string; nom: string };

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function FormulaireDepense({ lieux }: { lieux: Lieu[] }) {
  const [etat, action, enCours] = useActionState<EtatDepense, FormData>(ajouterDepense, null);
  return (
    <form action={action} className="formulaire">
      <label>
        Date
        <input type="date" name="date_depense" defaultValue={aujourdhui()} required />
      </label>
      <label>
        Lieu
        <select name="evenement_id" required defaultValue="">
          <option value="" disabled>-- Choisir --</option>
          {lieux.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
        </select>
      </label>
      <label>
        Motif
        <input name="motif" required />
      </label>
      <label>
        Catégorie
        <select name="categorie" required defaultValue="">
          <option value="" disabled>-- Choisir --</option>
          {CATEGORIES.map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
        </select>
      </label>
      <label>
        Quantité
        <input name="quantite" inputMode="decimal" defaultValue="1" required />
      </label>
      <label>
        Prix unitaire (F CFA)
        <input name="prix_unitaire" inputMode="numeric" required />
      </label>
      <button type="submit" disabled={enCours}>{enCours ? "Enregistrement..." : "Enregistrer la dépense"}</button>
      {etat && <p className={etat.ok ? "note" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</p>}
    </form>
  );
}

export function FormulaireAnnulerDepense({ id }: { id: string }) {
  const [etat, action, enCours] = useActionState<EtatDepense, FormData>(annulerDepense, null);
  return (
    <form action={action} className="formulaire">
      <input type="hidden" name="id" value={id} />
      <label>
        Motif de l&apos;annulation
        <input name="motif" required />
      </label>
      <button type="submit" className="secondaire petit" disabled={enCours}>
        {enCours ? "Annulation..." : "Annuler cette dépense"}
      </button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
    </form>
  );
}
