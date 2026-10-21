import type { SupabaseClient } from "@supabase/supabase-js";
import type { DonneesControles } from "./controles";

// Charge les données nécessaires aux contrôles. Lecture seule.
export async function chargerDonneesControles(supabase: SupabaseClient): Promise<DonneesControles> {
  const [{ data: ventes }, { data: depenses }, { data: reglements }, { data: depots }, { data: stock }, { data: prix }, { data: tiers }, { data: evenements }, { data: productions }, { data: parametres }] = await Promise.all([
    supabase.from("ventes").select("id, date_vente, montant, prix_unitaire, evenement_id, produit_id, remise_pct, remise_fcfa, mode_paiement, tiers_id, quantite").eq("statut", "actif"),
    supabase.from("depenses").select("date_depense").eq("statut", "actif"),
    supabase.from("reglements").select("tiers_id, origine, montant, date_reglement").eq("statut", "actif"),
    supabase.from("v_depots_lignes").select("id, tiers_id, tiers_nom, produit_nom, date_remise, quantite_confiee, quantite_donnee, quantite_vendue, quantite_restituee, coefficient, prix_cession, montant_du, quantite_a_payer"),
    supabase.from("v_stock").select("evenement_id, evenement_nom, produit_nom, stock_restant"),
    supabase.from("prix").select("produit_id, date_effet"),
    supabase.from("tiers").select("id, nom"),
    supabase.from("evenements").select("id, nom, est_point_de_vente"),
    supabase.from("productions").select("evenement_id"),
    supabase.from("parametres").select("delai_credit_jours").limit(1).maybeSingle(),
  ]);

  return {
    aujourdhui: new Date().toISOString().slice(0, 10),
    delai: parametres?.delai_credit_jours ?? 30,
    tiersNoms: new Map((tiers ?? []).map((t) => [t.id, t.nom])),
    evenementsNoms: new Map((evenements ?? []).map((e) => [e.id, e.nom])),
    evenementsAvecProduction: new Set((productions ?? []).map((p) => p.evenement_id)),
    pointsDeVente: new Set((evenements ?? []).filter((e) => e.est_point_de_vente).map((e) => e.id)),
    ventes: (ventes ?? []) as DonneesControles["ventes"],
    depenses: (depenses ?? []) as DonneesControles["depenses"],
    reglements: (reglements ?? []) as DonneesControles["reglements"],
    depots: (depots ?? []) as DonneesControles["depots"],
    stock: (stock ?? []) as DonneesControles["stock"],
    prix: (prix ?? []) as DonneesControles["prix"],
  };
}
