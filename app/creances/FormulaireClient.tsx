"use client";

import { useActionState, useEffect, useState } from "react";
import { enregistrerClient, type EtatReglement } from "./actions";
import { choisirContact, repertoireDisponible } from "@/lib/contacts";

// Modifie le nom et le téléphone d'un client, et peut les prendre dans le répertoire du téléphone.
export function FormulaireClient({ tiersId, nom, telephone }: { tiersId: string; nom: string; telephone: string | null }) {
  const [etat, action, enCours] = useActionState<EtatReglement, FormData>(enregistrerClient, null);
  const [nomSaisi, setNomSaisi] = useState(nom);
  const [telSaisi, setTelSaisi] = useState(telephone ?? "");
  const [peutRepertoire, setPeutRepertoire] = useState(false);
  useEffect(() => { setPeutRepertoire(repertoireDisponible()); }, []);

  return (
    <form action={action} className="formulaire">
      <input type="hidden" name="tiers_id" value={tiersId} />
      <label>
        Nom et prénoms
        <input name="nom" required value={nomSaisi} onChange={(e) => setNomSaisi(e.target.value)} />
      </label>
      <label>
        Téléphone
        <input name="telephone" type="tel" inputMode="tel" value={telSaisi} onChange={(e) => setTelSaisi(e.target.value)} placeholder="Ex. 07 00 00 00 00" />
      </label>
      {peutRepertoire && (
        <button
          type="button"
          className="secondaire"
          onClick={async () => {
            const c = await choisirContact();
            if (!c) return;
            if (c.nom) setNomSaisi(c.nom);
            if (c.telephone) setTelSaisi(c.telephone);
          }}
        >
          Prendre dans mon répertoire
        </button>
      )}
      <button type="submit" disabled={enCours}>{enCours ? "Enregistrement..." : "Enregistrer la fiche"}</button>
      {etat && !etat.ok && <p className="erreur">{etat.erreur}</p>}
      {etat?.ok && <p className="note">Fiche enregistrée.</p>}
    </form>
  );
}
