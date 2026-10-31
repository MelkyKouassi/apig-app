"use client";

import { useActionState } from "react";
import { confirmerStock, enregistrerStockDepart, type EtatStock } from "./actions";

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
