"use client";

import { useActionState, useState } from "react";
import { enregistrerClient, type EtatReglement } from "./actions";
import { ChampTelephone } from "@/components/ChampTelephone";
import { INDICATIF_DEFAUT, decouperTelephone } from "@/lib/telephone";

// Modifie le nom et le téléphone (avec indicatif) d'un client.
export function FormulaireClient({ tiersId, nom, telephone }: { tiersId: string; nom: string; telephone: string | null }) {
  const [etat, action, enCours] = useActionState<EtatReglement, FormData>(enregistrerClient, null);
  const [nomSaisi, setNomSaisi] = useState(nom);
  const d = telephone ? decouperTelephone(telephone) : null;

  return (
    <form action={action} className="formulaire">
      <input type="hidden" name="tiers_id" value={tiersId} />
      <label>
        Nom et prénoms
        <input name="nom" required value={nomSaisi} onChange={(e) => setNomSaisi(e.target.value)} />
      </label>
      <ChampTelephone
        indicatifInitial={d?.code ?? INDICATIF_DEFAUT}
        numeroInitial={d?.national ?? telephone ?? ""}
        onNom={setNomSaisi}
      />
      <button type="submit" disabled={enCours}>{enCours ? "Enregistrement..." : "Enregistrer la fiche"}</button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="note">Fiche enregistrée.</p>}
    </form>
  );
}
