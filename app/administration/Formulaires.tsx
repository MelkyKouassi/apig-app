"use client";

import { useActionState } from "react";
import {
  enregistrerCollaborateur,
  enregistrerEntreprise,
  enregistrerParametres,
  enregistrerProfil,
  type EtatAdmin,
} from "./actions";

const pourcent = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(Math.round(Number(v) * 10000) / 100));

function Message({ etat, succes = "Enregistré." }: { etat: EtatAdmin; succes?: string }) {
  if (!etat) return null;
  return etat.ok ? <p className="succes">{succes}</p> : <p className="erreur">{etat.erreur}</p>;
}

type Entreprise = {
  raison_sociale: string;
  adresse: string | null;
  ville: string | null;
  telephone: string | null;
  rccm: string | null;
  compte_contribuable: string | null;
  numero_cnps: string | null;
  signataire: string | null;
  signataire_qualite: string | null;
};

export function FormulaireEntreprise({ entreprise }: { entreprise: Entreprise }) {
  const [etat, action, enCours] = useActionState<EtatAdmin, FormData>(enregistrerEntreprise, null);
  return (
    <form action={action} className="formulaire">
      <label>Raison sociale <input name="raison_sociale" defaultValue={entreprise.raison_sociale} required /></label>
      <label>Adresse <input name="adresse" defaultValue={entreprise.adresse ?? ""} /></label>
      <label>Ville <input name="ville" defaultValue={entreprise.ville ?? ""} /></label>
      <label>Téléphone <input name="telephone" defaultValue={entreprise.telephone ?? ""} /></label>
      <label>RCCM <input name="rccm" defaultValue={entreprise.rccm ?? ""} /></label>
      <label>N° contribuable <input name="compte_contribuable" defaultValue={entreprise.compte_contribuable ?? ""} /></label>
      <label>N° CNPS employeur <input name="numero_cnps" defaultValue={entreprise.numero_cnps ?? ""} placeholder="À compléter" /></label>
      <label>Signataire des bulletins <input name="signataire" defaultValue={entreprise.signataire ?? ""} /></label>
      <label>Qualité du signataire <input name="signataire_qualite" defaultValue={entreprise.signataire_qualite ?? ""} /></label>
      <button type="submit" className="secondaire" disabled={enCours}>{enCours ? "Enregistrement..." : "Enregistrer l'entreprise"}</button>
      <Message etat={etat} />
    </form>
  );
}

type Parametres = Record<string, number | boolean | null>;

export function FormulaireParametres({ p }: { p: Parametres }) {
  const [etat, action, enCours] = useActionState<EtatAdmin, FormData>(enregistrerParametres, null);
  const n = (nom: string) => String(p[nom] ?? "");
  return (
    <form action={action} className="formulaire">
      <p className="entete"><strong>Général</strong></p>
      <label>Dîme par défaut (%) <input name="dime_defaut" inputMode="decimal" defaultValue={pourcent(p.dime_defaut as number)} required /></label>
      <label>Coefficient pharmacie <input name="coef_pharmacie" inputMode="decimal" defaultValue={n("coef_pharmacie")} required /></label>
      <label>Coefficient personnel <input name="coef_personnel" inputMode="decimal" defaultValue={n("coef_personnel")} required /></label>
      <label>Délai de paiement (jours) <input name="delai_paiement_jours" inputMode="numeric" defaultValue={n("delai_paiement_jours")} required /></label>
      <label>Délai de crédit (jours) <input name="delai_credit_jours" inputMode="numeric" defaultValue={n("delai_credit_jours")} required /></label>
      <label>Seuil de relance ferme (jours) <input name="seuil_relance_ferme" inputMode="numeric" defaultValue={n("seuil_relance_ferme")} required /></label>
      <label>Seuil urgent (jours) <input name="seuil_urgent" inputMode="numeric" defaultValue={n("seuil_urgent")} required /></label>

      <p className="entete"><strong>Paie et épargne</strong></p>
      <label>Année de référence <input name="annee_reference" inputMode="numeric" defaultValue={n("annee_reference")} required /></label>
      <label>Taux d&apos;impôt (%) <input name="taux_impot" inputMode="decimal" defaultValue={pourcent(p.taux_impot as number)} required /></label>
      <label>Réserve légale (%) <input name="reserve_legale_taux" inputMode="decimal" defaultValue={pourcent(p.reserve_legale_taux as number)} required /></label>
      <label>Plafond de la réserve (%) <input name="reserve_plafond_taux" inputMode="decimal" defaultValue={pourcent(p.reserve_plafond_taux as number)} required /></label>
      <label>Capital social (F CFA) <input name="capital_social" inputMode="decimal" defaultValue={n("capital_social")} /></label>
      <label>Réserve déjà constituée (F CFA) <input name="reserve_deja_constituee" inputMode="decimal" defaultValue={n("reserve_deja_constituee")} required /></label>
      <label>Taux d&apos;épargne (%) <input name="epargne_taux" inputMode="decimal" defaultValue={pourcent(p.epargne_taux as number)} required /></label>
      <label>Part distribuée (%) <input name="part_distribuee" inputMode="decimal" defaultValue={pourcent(p.part_distribuee as number)} required /></label>
      <label className="case"><input type="checkbox" name="deduire_dime" defaultChecked={Boolean(p.deduire_dime)} /> Déduire la dîme du résultat</label>
      <label className="case"><input type="checkbox" name="reporter_deficits" defaultChecked={Boolean(p.reporter_deficits)} /> Reporter les déficits</label>
      <label className="case"><input type="checkbox" name="reintegrer_remunerations" defaultChecked={Boolean(p.reintegrer_remunerations)} /> Réintégrer les rémunérations</label>

      <p className="entete" style={{ fontSize: "0.9rem" }}>
        Attention : modifier ces valeurs change les calculs de tous les mois concernés (paie, tableau de bord, contrôles).
      </p>
      <button type="submit" className="secondaire" disabled={enCours}>{enCours ? "Enregistrement..." : "Enregistrer les paramètres"}</button>
      <Message etat={etat} />
    </form>
  );
}

export type CollaborateurFiche = {
  id?: string;
  nom: string;
  parts: number;
  matricule: string | null;
  fonction: string | null;
  date_entree: string | null;
  mode_paiement: string | null;
  numero_cnps: string | null;
  actif: boolean;
};

export function FormulaireCollaborateur({ c }: { c: CollaborateurFiche | null }) {
  const [etat, action, enCours] = useActionState<EtatAdmin, FormData>(enregistrerCollaborateur, null);
  const nouveau = c === null;
  return (
    <form action={action} className="formulaire">
      {c?.id && <input type="hidden" name="id" value={c.id} />}
      <label>Nom et prénoms <input name="nom" defaultValue={c?.nom ?? ""} required /></label>
      <label>Nombre de parts <input name="parts" inputMode="decimal" defaultValue={c ? String(c.parts) : ""} required /></label>
      <label>Matricule <input name="matricule" defaultValue={c?.matricule ?? ""} /></label>
      <label>Fonction <input name="fonction" defaultValue={c?.fonction ?? ""} /></label>
      <label>Date d&apos;entrée <input name="date_entree" type="date" defaultValue={c?.date_entree ?? ""} /></label>
      <label>Mode de paiement <input name="mode_paiement" defaultValue={c?.mode_paiement ?? ""} /></label>
      <label>N° CNPS <input name="numero_cnps" defaultValue={c?.numero_cnps ?? ""} placeholder="À compléter" /></label>
      <label className="case"><input type="checkbox" name="actif" defaultChecked={nouveau ? true : c.actif} /> Actif</label>
      <button type="submit" className="secondaire" disabled={enCours}>{enCours ? "Enregistrement..." : nouveau ? "Ajouter le collaborateur" : "Enregistrer la fiche"}</button>
      <Message etat={etat} />
    </form>
  );
}

export function FormulaireProfil({ id, nom, role, actif }: { id: string; nom: string; role: string; actif: boolean }) {
  const [etat, action, enCours] = useActionState<EtatAdmin, FormData>(enregistrerProfil, null);
  return (
    <form action={action} className="formulaire">
      <input type="hidden" name="id" value={id} />
      <label>Rôle de {nom}
        <select name="role" defaultValue={role}>
          <option value="gerant">Gérant</option>
          <option value="comptable">Comptable</option>
          <option value="commercial">Commercial</option>
          <option value="collaboratrice">Collaborateur (bulletin)</option>
        </select>
      </label>
      <label className="case"><input type="checkbox" name="actif" defaultChecked={actif} /> Compte actif</label>
      <button type="submit" className="secondaire" disabled={enCours}>{enCours ? "Enregistrement..." : "Enregistrer le compte"}</button>
      <Message etat={etat} />
    </form>
  );
}
