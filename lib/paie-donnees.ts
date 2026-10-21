import type { SupabaseClient } from "@supabase/supabase-js";
import { calculerPaie, partCollaborateur, type LignePaie, type MoisDonnees, type OptionsPaie } from "./paie";

export type CollaborateurPaie = { id: string; nom: string; parts: number };
export type VersementPaie = { id: string; collaborateur_id: string; date_versement: string; mois: number; montant: number };

export type PaieAnnee = {
  annee: number;
  options: OptionsPaie;
  lignes: LignePaie[];
  collaborateurs: CollaborateurPaie[];
  totalParts: number;
  // montant dû par collaborateur et par mois (index 0 = janvier)
  duParMois: Map<string, number[]>;
  versements: VersementPaie[];
};

// Charge les données de paie d'une année et calcule l'enveloppe, les parts et les montants dus.
export async function chargerPaie(supabase: SupabaseClient): Promise<PaieAnnee> {
  const [{ data: p }, { data: ventes }, { data: depenses }, { data: evts }, { data: primes }, { data: charges }, { data: chargesReelles }, { data: collabs }, { data: versements }] = await Promise.all([
    supabase.from("parametres").select("*").limit(1).maybeSingle(),
    supabase.from("ventes").select("date_vente, montant, evenement_id").eq("statut", "actif"),
    supabase.from("depenses").select("date_depense, montant, categorie, evenement_id").eq("statut", "actif"),
    supabase.from("evenements").select("id, nom, est_point_de_vente, taux_dime, date_fin"),
    supabase.from("v_primes").select("annee, mois, prime"),
    supabase.from("charges").select("id, nature, montant_habituel").eq("actif", true),
    supabase.from("charges_mensuelles").select("charge_id, annee, mois, montant_reel"),
    supabase.from("collaborateurs").select("id, nom, parts").order("nom"),
    supabase.from("versements").select("id, collaborateur_id, date_versement, annee, mois, montant").order("date_versement"),
  ]);

  const annee = Number(p?.annee_reference ?? 2026);
  const options: OptionsPaie = {
    taux_impot: Number(p?.taux_impot ?? 0.25),
    reserve_legale_taux: Number(p?.reserve_legale_taux ?? 0.1),
    reserve_plafond_taux: Number(p?.reserve_plafond_taux ?? 0.2),
    capital_social: Number(p?.capital_social ?? 1500000),
    reserve_deja_constituee: Number(p?.reserve_deja_constituee ?? 0),
    epargne_taux: Number(p?.epargne_taux ?? 0.1),
    part_distribuee: Number(p?.part_distribuee ?? 0.5),
    reintegrer_remunerations: Boolean(p?.reintegrer_remunerations),
    deduire_dime: Boolean(p?.deduire_dime),
    reporter_deficits: Boolean(p?.reporter_deficits),
  };

  const lieux = new Map((evts ?? []).map((e) => [e.id, e]));
  const donnees: MoisDonnees[] = Array.from({ length: 12 }, () => ({ ca: 0, depenses: 0, remunerations: 0, primes: 0, dime: 0, chargesFixes: 0, chargesNonFixes: 0 }));
  const benefLieuMois = new Map<string, number>();
  const totalEvenement = new Map<string, { ca: number; dep: number }>();

  for (const v of ventes ?? []) {
    if (!v.date_vente || Number(v.date_vente.slice(0, 4)) !== annee) continue;
    const m = Number(v.date_vente.slice(5, 7)) - 1;
    donnees[m].ca += Number(v.montant ?? 0);
    const k = `${v.evenement_id}|${m}`;
    benefLieuMois.set(k, (benefLieuMois.get(k) ?? 0) + Number(v.montant ?? 0));
    const t = totalEvenement.get(v.evenement_id ?? "") ?? { ca: 0, dep: 0 };
    t.ca += Number(v.montant ?? 0);
    totalEvenement.set(v.evenement_id ?? "", t);
  }
  for (const d of depenses ?? []) {
    if (!d.date_depense || Number(d.date_depense.slice(0, 4)) !== annee) continue;
    const m = Number(d.date_depense.slice(5, 7)) - 1;
    donnees[m].depenses += Number(d.montant ?? 0);
    if (d.categorie === "remuneration_interessement") donnees[m].remunerations += Number(d.montant ?? 0);
    const k = `${d.evenement_id}|${m}`;
    benefLieuMois.set(k, (benefLieuMois.get(k) ?? 0) - Number(d.montant ?? 0));
    const t = totalEvenement.get(d.evenement_id ?? "") ?? { ca: 0, dep: 0 };
    t.dep += Number(d.montant ?? 0);
    totalEvenement.set(d.evenement_id ?? "", t);
  }
  // Dîme (règle du classeur) : point de vente par mois ; événement entier au mois de sa fin.
  for (const [k, benef] of benefLieuMois) {
    const [id, m] = k.split("|");
    if (!lieux.get(id)?.est_point_de_vente) continue;
    donnees[Number(m)].dime += benef * Number(lieux.get(id)?.taux_dime ?? 0.1);
  }
  for (const [id, t] of totalEvenement) {
    const lieu = lieux.get(id);
    if (!lieu || lieu.est_point_de_vente) continue;
    const fin = lieu.date_fin ?? "";
    if (!fin.startsWith(String(annee))) continue;
    donnees[Number(fin.slice(5, 7)) - 1].dime += (t.ca - t.dep) * Number(lieu.taux_dime ?? 0.1);
  }
  // Primes rattachées au mois de fin de l'événement.
  for (const pr of primes ?? []) {
    if (pr.annee === annee && pr.mois) donnees[pr.mois - 1].primes += Number(pr.prime);
  }
  // Charges : facture réelle du mois si saisie, sinon montant habituel (fixes uniquement).
  const reelles = new Map((chargesReelles ?? []).map((r) => [`${r.charge_id}|${r.annee}|${r.mois}`, Number(r.montant_reel)]));
  for (const c of charges ?? []) {
    for (let m = 1; m <= 12; m++) {
      const reel = reelles.get(`${c.id}|${annee}|${m}`);
      const montant = reel ?? (c.nature === "fixe" ? Number(c.montant_habituel ?? 0) : 0);
      if (c.nature === "fixe") donnees[m - 1].chargesFixes += montant;
      else donnees[m - 1].chargesNonFixes += montant;
    }
  }

  const lignes = calculerPaie(donnees, options);
  const collaborateurs = (collabs ?? []).map((c) => ({ id: c.id, nom: c.nom, parts: Number(c.parts) }));
  const totalParts = collaborateurs.reduce((s, c) => s + c.parts, 0);

  const duParMois = new Map<string, number[]>();
  for (const c of collaborateurs) {
    duParMois.set(c.id, lignes.map((l) => partCollaborateur(l.enveloppe, c.parts, totalParts)));
  }

  const versementsAnnee: VersementPaie[] = (versements ?? [])
    .filter((v) => v.annee === annee)
    .map((v) => ({ id: v.id, collaborateur_id: v.collaborateur_id, date_versement: v.date_versement, mois: v.mois, montant: Number(v.montant) }));

  return { annee, options, lignes, collaborateurs, totalParts, duParMois, versements: versementsAnnee };
}
