"use client";

import { useActionState, useState } from "react";
import { enregistrerNouveauDepot, type EtatNouveauDepot } from "./actions";

type Option = { id: string; nom: string };
type Destinataire = Option & { type: string };

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function FormulaireNouveauDepot({ destinataires, produits }: { destinataires: Destinataire[]; produits: Option[] }) {
  const [etat, action, enCours] = useActionState<EtatNouveauDepot, FormData>(enregistrerNouveauDepot, null);
  const [nouveau, setNouveau] = useState(false);

  return (
    <form action={action} className="formulaire">
      <label>
        Date de remise
        <input name="date_remise" type="date" defaultValue={aujourdhui()} required />
      </label>

      {!nouveau ? (
        <label>
          Destinataire
          <select name="tiers_id" required defaultValue="">
            <option value="" disabled>Choisir...</option>
            {destinataires.map((d) => (
              <option key={d.id} value={d.id}>{d.nom} ({d.type === "pharmacie" ? "pharmacie" : "personnel"})</option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label>
            Nouveau destinataire
            <input name="nouveau_nom" type="text" placeholder="Nom" />
          </label>
          <label>
            Type
            <select name="nouveau_type" defaultValue="">
              <option value="" disabled>Choisir...</option>
              <option value="pharmacie">Pharmacie</option>
              <option value="personnel">Personnel</option>
            </select>
          </label>
        </>
      )}
      <button type="button" className="lien" onClick={() => setNouveau(!nouveau)}>
        {nouveau ? "Choisir un destinataire existant" : "Ajouter un nouveau destinataire"}
      </button>

      <label>
        Produit
        <select name="produit_id" required defaultValue="">
          <option value="" disabled>Choisir...</option>
          {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
      </label>
      <label>
        Quantité confiée
        <input name="quantite_confiee" type="number" min="1" step="any" inputMode="decimal" required />
      </label>
      <label>
        Quantité donnée (marketing, non facturée)
        <input name="quantite_donnee" type="number" min="0" step="any" inputMode="decimal" defaultValue="0" />
      </label>

      <button type="submit" className="bouton" disabled={enCours}>
        {enCours ? "Enregistrement..." : "Enregistrer le dépôt"}
      </button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="succes">Dépôt enregistré. Il apparaît dans le bilan du destinataire.</p>}
    </form>
  );
}
