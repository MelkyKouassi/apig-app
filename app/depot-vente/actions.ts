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
