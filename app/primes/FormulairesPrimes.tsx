"use client";

import { useActionState } from "react";
import {
  ajouterPalier,
  ajouterPrimeManuelle,
  enregistrerDatesEvenement,
  type EtatPrimes,
} from "./actions";

type Option = { id: string; nom: string };
const aujourdhui = () => new Date().toISOString().slice(0, 10);

function Retour({ etat }: { etat: EtatPrimes }) {
  if (!etat) return null;
  return etat.ok ? <p className="succes">Enregistré.</p> : <p className="erreur">{etat.erreur}</p>;
}

export function FormulaireDatesEvenement({ evenements }: { evenements: Option[] }) {
  const [etat, action, enCours] = useActionState<EtatPrimes, FormData>(enregistrerDatesEvenement, null);
  return (
    <form action={action} className="formulaire">
      <select name="evenement_id" required defaultValue="">
        <option value="" disabled>— Événement —</option>
        {evenements.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
      </select>
      <label>Début <input name="date_debut" type="date" required /></label>
      <label>Fin <input name="date_fin" type="date" required /></label>
      <button type="submit" className="secondaire" disabled={enCours}>{enCours ? "Enregistrement..." : "Enregistrer les dates"}</button>
      <Retour etat={etat} />
    </form>
  );
}

export function FormulairePalier({ evenements }: { evenements: Option[] }) {
  const [etat, action, enCours] = useActionState<EtatPrimes, FormData>(ajouterPalier, null);
  return (
    <form action={action} className="formulaire">
      <select name="evenement_id" defaultValue="">
        <option value="">Barème standard</option>
        {evenements.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
      </select>
      <input name="seuil_ca" type="number" min="0" step="any" placeholder="CA à partir de (F)" required />
      <input name="taux" type="number" min="0" max="100" step="any" placeholder="Taux (%)" required />
      <button type="submit" className="secondaire" disabled={enCours}>{enCours ? "Enregistrement..." : "Enregistrer le palier"}</button>
      <Retour etat={etat} />
    </form>
  );
}

export function FormulairePrimeManuelle({ evenements, commerciaux }: { evenements: Option[]; commerciaux: Option[] }) {
  const [etat, action, enCours] = useActionState<EtatPrimes, FormData>(ajouterPrimeManuelle, null);
  return (
    <form action={action} className="formulaire">
      <input name="date_saisie" type="date" defaultValue={aujourdhui()} required />
      <select name="evenement_id" required defaultValue="">
        <option value="" disabled>— Événement —</option>
        {evenements.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
      </select>
      <select name="commercial_id" required defaultValue="">
        <option value="" disabled>— Commercial —</option>
        {commerciaux.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
      </select>
      <input name="montant_vendu" type="number" min="0" step="any" placeholder="Montant vendu (F)" required />
      <button type="submit" className="secondaire" disabled={enCours}>{enCours ? "Enregistrement..." : "Ajouter la saisie"}</button>
      <Retour etat={etat} />
    </form>
  );
}
