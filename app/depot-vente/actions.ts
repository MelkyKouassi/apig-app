"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EtatReglementDepot = { ok: true } | { ok: false; erreur: string } | null;

// Règlement reçu d'un destinataire de dépôt-vente. Réservé au gérant. Rien n'est supprimé.
export async function enregistrerReglementDepot(
  _etat: EtatReglementDepot,
  formData: FormData,
): Promise<EtatReglementDepot> {
  const tiersId = String(formData.get("tiers_id") ?? "");
  const dateReglement = String(formData.get("date_reglement") ?? "");
  const montant = Number(formData.get("montant") ?? 0);

  if (!tiersId) return { ok: false, erreur: "Destinataire introuvable." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReglement)) return { ok: false, erreur: "Date invalide." };
  if (!(montant > 0)) return { ok: false, erreur: "Le montant doit être supérieur à 0." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: "Votre session a expiré. Reconnectez-vous." };

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") return { ok: false, erreur: "Seul le gérant peut enregistrer ce règlement." };

  // Contrôle : le règlement ne doit pas dépasser le montant dû restant.
  const [{ data: lignes }, { data: reglements }] = await Promise.all([
    supabase.from("v_depots_lignes").select("montant_du").eq("tiers_id", tiersId),
    supabase.from("reglements").select("montant").eq("tiers_id", tiersId).eq("origine", "depot").eq("statut", "actif"),
  ]);
  const totalDu = (lignes ?? []).reduce((s, l) => s + Number(l.montant_du ?? 0), 0);
  const totalRegle = (reglements ?? []).reduce((s, l) => s + Number(l.montant ?? 0), 0);
  const reste = totalDu - totalRegle;
  if (montant > reste + 1) {
    return { ok: false, erreur: `Le règlement dépasse le reste à payer (${Math.round(reste).toLocaleString("fr-FR")} F).` };
  }

  const { error } = await supabase.from("reglements").insert({
    tiers_id: tiersId,
    date_reglement: dateReglement,
    montant,
    origine: "depot",
    statut: "actif",
    created_by: user.id,
  });
  if (error) return { ok: false, erreur: "Le règlement n'a pas pu être enregistré." };

  revalidatePath("/depot-vente");
  return { ok: true };
}

export type EtatLigneDepot = { ok: true } | { ok: false; erreur: string } | null;

async function gerantConnecte() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, erreur: "Votre session a expiré. Reconnectez-vous." as const };
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") return { supabase, erreur: "Seul le gérant peut modifier un dépôt." as const };
  return { supabase, user, erreur: null };
}

// Restitution de produits non vendus. Le total restitué ne peut pas dépasser ce qui reste chez le destinataire.
export async function enregistrerRestitution(_etat: EtatLigneDepot, formData: FormData): Promise<EtatLigneDepot> {
  const depotId = String(formData.get("depot_id") ?? "");
  const dateRestitution = String(formData.get("date_restitution") ?? "");
  const quantite = Number(formData.get("quantite") ?? 0);

  if (!depotId) return { ok: false, erreur: "Ligne de dépôt introuvable." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRestitution)) return { ok: false, erreur: "Date invalide." };
  if (!(quantite > 0)) return { ok: false, erreur: "La quantité doit être supérieure à 0." };

  const auth = await gerantConnecte();
  if (auth.erreur || !auth.user) return { ok: false, erreur: auth.erreur ?? "Session invalide." };

  const { data: ligne } = await auth.supabase
    .from("v_depots_lignes")
    .select("quantite_a_payer")
    .eq("id", depotId)
    .maybeSingle();
  if (!ligne) return { ok: false, erreur: "Ligne de dépôt introuvable." };
  const restant = Number(ligne.quantite_a_payer);
  if (quantite > restant) {
    return { ok: false, erreur: `Quantité supérieure à ce qui reste chez le destinataire (${restant}).` };
  }

  const { error } = await auth.supabase.from("restitutions").insert({
    depot_id: depotId,
    date_restitution: dateRestitution,
    quantite,
    created_by: auth.user.id,
  });
  if (error) return { ok: false, erreur: "La restitution n'a pas pu être enregistrée." };

  revalidatePath("/depot-vente");
  return { ok: true };
}

// Quantité vendue sur une ligne de dépôt (saisie corrigeable).
export async function enregistrerQuantiteVendue(_etat: EtatLigneDepot, formData: FormData): Promise<EtatLigneDepot> {
  const depotId = String(formData.get("depot_id") ?? "");
  const quantite = Number(formData.get("quantite_vendue") ?? -1);

  if (!depotId) return { ok: false, erreur: "Ligne de dépôt introuvable." };
  if (!(quantite >= 0)) return { ok: false, erreur: "La quantité vendue ne peut pas être négative." };

  const auth = await gerantConnecte();
  if (auth.erreur || !auth.user) return { ok: false, erreur: auth.erreur ?? "Session invalide." };

  const { error } = await auth.supabase
    .from("depots")
    .update({ quantite_vendue: quantite })
    .eq("id", depotId);
  if (error) return { ok: false, erreur: "La quantité vendue n'a pas pu être enregistrée." };

  revalidatePath("/depot-vente");
  return { ok: true };
}
