"use client";

import { useActionState } from "react";
import { ajouterProduit, enregistrerMode, enregistrerPrix, type EtatCatalogue } from "./actions";

type Option = { id: string; nom: string };

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function FormulaireMode() {
  const [etat, action, enCours] = useActionState<EtatCatalogue, FormData>(enregistrerMode, null);
  return (
    <form action={action} className="formulaire">
      <label>
        Prix à appliquer
        <select name="mode" defaultValue="normal">
          <option value="normal">Prix normal</option>
          <option value="promotionnel">Prix promotionnel</option>
        </select>
      </label>
      <label>
        À partir du
        <input type="date" name="date_effet" defaultValue={aujourdhui()} required />
      </label>
      <button type="submit" disabled={enCours}>{enCours ? "Enregistrement..." : "Appliquer ce réglage"}</button>
      {etat && <p className={etat.ok ? "note" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</p>}
    </form>
  );
}

export function FormulairePrix({ produits, evenements }: { produits: Option[]; evenements: Option[] }) {
  const [etat, action, enCours] = useActionState<EtatCatalogue, FormData>(enregistrerPrix, null);
  return (
    <form action={action} className="formulaire">
      <label>
        Produit
        <select name="produit_id" required defaultValue="">
          <option value="" disabled>-- Choisir --</option>
          {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
      </label>
      <label>
        Type de prix
        <select name="type_prix" defaultValue="normal">
          <option value="normal">Prix normal</option>
          <option value="promotionnel">Prix promotionnel</option>
        </select>
      </label>
      <label>
        Prix (F CFA)
        <input name="prix" inputMode="numeric" required />
      </label>
      <label>
        Date d&apos;effet
        <input type="date" name="date_effet" defaultValue={aujourdhui()} required />
      </label>
      <label>
        Lieu (facultatif)
        <select name="evenement_id" defaultValue="">
          <option value="">Prix de base (tous les lieux)</option>
          {evenements.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
      </label>
      <button type="submit" disabled={enCours}>{enCours ? "Enregistrement..." : "Enregistrer le prix"}</button>
      {etat && <p className={etat.ok ? "note" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</p>}
    </form>
  );
}

export function FormulaireProduit() {
  const [etat, action, enCours] = useActionState<EtatCatalogue, FormData>(ajouterProduit, null);
  return (
    <form action={action} className="formulaire">
      <label>
        Nom du produit
        <input name="nom" required />
      </label>
      <label>
        Prix normal (F CFA)
        <input name="prix_base" inputMode="numeric" required />
      </label>
      <label>
        Prix promotionnel (F CFA, facultatif)
        <input name="prix_promotionnel" inputMode="numeric" placeholder="Vide : le prix normal s'applique" />
      </label>
      <label>
        Coefficient de cession
        <input name="coefficient" inputMode="decimal" defaultValue="1.51" required />
      </label>
      <button type="submit" disabled={enCours}>{enCours ? "Enregistrement..." : "Ajouter le produit"}</button>
      {etat && <p className={etat.ok ? "note" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</p>}
    </form>
  );
}
