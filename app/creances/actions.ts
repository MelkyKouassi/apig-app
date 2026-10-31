"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MESSAGE_TELEPHONE, normaliserTelephone, telephoneVide, variantesTelephone } from "@/lib/telephone";

export type EtatReglement = { ok: true } | { ok: false; erreur: string } | null;

// Enregistre un règlement reçu d'un client à crédit. Rien n'est supprimé.
export async function enregistrerReglement(_etat: EtatReglement, formData: FormData): Promise<EtatReglement> {
  const tiersId = String(formData.get("tiers_id") ?? "");
  const dateReglement = String(formData.get("date_reglement") ?? "");
  const montant = Number(formData.get("montant") ?? 0);

  if (!tiersId) return { ok: false, erreur: "Client introuvable." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReglement)) return { ok: false, erreur: "Date invalide." };
  if (!(montant > 0)) return { ok: false, erreur: "Le montant doit être supérieur à 0." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: "Votre session a expiré. Reconnectez-vous." };

  // Contrôle : le règlement ne doit pas dépasser le reste à payer.
  const [{ data: ventes }, { data: reglements }] = await Promise.all([
    supabase.from("ventes").select("montant").eq("tiers_id", tiersId).eq("mode_paiement", "credit").eq("statut", "actif"),
    supabase.from("reglements").select("montant").eq("tiers_id", tiersId).eq("origine", "credit").eq("statut", "actif"),
  ]);
  const totalDu = (ventes ?? []).reduce((s, l) => s + Number(l.montant ?? 0), 0);
  const totalRecu = (reglements ?? []).reduce((s, l) => s + Number(l.montant ?? 0), 0);
  const reste = totalDu - totalRecu;
  if (montant > reste + 1) {
    return { ok: false, erreur: `Le règlement dépasse le reste à payer (${Math.round(reste).toLocaleString("fr-FR")} F).` };
  }

  const { error } = await supabase.from("reglements").insert({
    tiers_id: tiersId,
    date_reglement: dateReglement,
    montant,
    origine: "credit",
    statut: "actif",
    created_by: user.id,
  });
  if (error) return { ok: false, erreur: "Le règlement n'a pas pu être enregistré." };

  revalidatePath("/creances");
  return { ok: true };
}

// Modifie la fiche d'un client : nom et téléphone. Un numéro déjà attribué à un autre client est refusé.
export async function enregistrerClient(_etat: EtatReglement, formData: FormData): Promise<EtatReglement> {
  const tiersId = String(formData.get("tiers_id") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();
  const brutTel = String(formData.get("telephone") ?? "");
  const telephone = telephoneVide(brutTel) ? null : normaliserTelephone(brutTel);
  if (!telephoneVide(brutTel) && !telephone) return { ok: false, erreur: MESSAGE_TELEPHONE };

  if (!tiersId) return { ok: false, erreur: "Client introuvable." };
  if (!nom) return { ok: false, erreur: "Le nom ne peut pas être vide." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: "Votre session a expiré. Reconnectez-vous." };

  if (telephone) {
    const { data: autre } = await supabase
      .from("tiers").select("nom").in("telephone", variantesTelephone(telephone)).neq("id", tiersId).limit(1).maybeSingle();
    if (autre) return { ok: false, erreur: `Ce numéro appartient déjà à « ${autre.nom} ». Vérifiez-le.` };
  }

  const { error } = await supabase.from("tiers").update({ nom, telephone }).eq("id", tiersId);
  if (error) return { ok: false, erreur: "La fiche n'a pas pu être modifiée." };

  revalidatePath("/creances");
  revalidatePath("/ventes/nouvelle");
  revalidatePath("/saisie");
  return { ok: true };
}
