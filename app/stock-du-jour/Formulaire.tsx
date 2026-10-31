"use client";

import { useActionState } from "react";
import { confirmerStock, declarerMouvement, enregistrerStockDepart, type EtatStock } from "./actions";

type Ligne = { id: string; nom: string; quantite: number | null };

export function FormulaireStock({
  evenementId,
  produits,
  statut,
}: {
  evenementId: string;
  produits: Ligne[];
  statut: "attente" | "valide" | "confirme";
}) {
  const [etatSaisie, envoyerSaisie, enCoursSaisie] = useActionState<EtatStock, FormData>(enregistrerStockDepart, null);
  const [etatConfirme, envoyerConfirme, enCoursConfirme] = useActionState<EtatStock, FormData>(confirmerStock, null);

  return (
    <>
      <form action={envoyerSaisie} className="formulaire">
        <input type="hidden" name="evenement_id" value={evenementId} />
        {produits.map((p) => (
          <label key={p.id}>
            {p.nom}
            <input
              name={`qte_${p.id}`}
              inputMode="numeric"
              defaultValue={p.quantite ?? ""}
              placeholder="Rien emporté"
              aria-label={`Quantité emportée de ${p.nom}`}
            />
          </label>
        ))}
        <button type="submit" disabled={enCoursSaisie}>
          {enCoursSaisie ? "Enregistrement..." : "Enregistrer mon stock"}
        </button>
        {etatSaisie && <p className={etatSaisie.ok ? "note" : "erreur"}>{etatSaisie.ok ? etatSaisie.message : etatSaisie.erreur}</p>}
      </form>

      <form action={envoyerConfirme} className="formulaire">
        <input type="hidden" name="evenement_id" value={evenementId} />
        <button type="submit" disabled={enCoursConfirme || statut !== "valide"}>
          {enCoursConfirme ? "Confirmation..." : "Je confirme mon stock"}
        </button>
        {etatConfirme && <p className={etatConfirme.ok ? "succes" : "erreur"}>{etatConfirme.ok ? etatConfirme.message : etatConfirme.erreur}</p>}
      </form>
    </>
  );
}

type Option = { id: string; nom: string };

export function FormulaireMouvement({ evenementId, produits }: { evenementId: string; produits: Option[] }) {
  const [etat, envoyer, enCours] = useActionState<EtatStock, FormData>(declarerMouvement, null);
  return (
    <form action={envoyer} className="formulaire">
      <input type="hidden" name="evenement_id" value={evenementId} />
      <p className="sous-titre">Restitution ou complément en cours de journée</p>
      <label>
        Produit
        <select name="produit_id" required defaultValue="">
          <option value="" disabled>-- Choisir --</option>
          {produits.map((p) => (
            <option key={p.id} value={p.id}>{p.nom}</option>
          ))}
        </select>
      </label>
      <label>
        Type
        <select name="type" defaultValue="restitution">
          <option value="restitution">Restitution (produits rendus)</option>
          <option value="complement">Complément (produits ajoutés)</option>
        </select>
      </label>
      <label>
        Quantité
        <input name="quantite" inputMode="numeric" required placeholder="Ex. 3" />
      </label>
      <button type="submit" className="secondaire" disabled={enCours}>
        {enCours ? "Enregistrement..." : "Déclarer"}
      </button>
      {etat && <p className={etat.ok ? "note" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</p>}
    </form>
  );
}
