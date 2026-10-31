"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EtatStock = { ok: true; message: string } | { ok: false; erreur: string } | null;

async function ficheDuCommercial() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, fiche: null, erreur: "Votre session a expiré. Reconnectez-vous." };
  const { data: fiche } = await supabase
    .from("commerciaux").select("id").eq("user_id", user.id).eq("actif", true).maybeSingle();
  if (!fiche) return { supabase, fiche: null, erreur: "Votre compte n'est pas relié à une fiche commercial." };
  return { supabase, fiche, erreur: null };
}

// Le commercial saisit le stock qu'il emporte pour un lieu. Un champ vide retire le produit.
// Seules les lignes qui changent sont écrites : une saisie identique ne remet pas la validation à zéro.
export async function enregistrerStockDepart(_etat: EtatStock, f: FormData): Promise<EtatStock> {
  const { supabase, fiche, erreur } = await ficheDuCommercial();
  if (!fiche) return { ok: false, erreur: erreur ?? "Accès refusé." };

  const evenementId = String(f.get("evenement_id") ?? "");
  if (!evenementId) return { ok: false, erreur: "Choisissez d'abord le lieu." };

  const { data: existants } = await supabase
    .from("stock_depart").select("produit_id, quantite")
    .eq("evenement_id", evenementId).eq("commercial_id", fiche.id);
  const actuel = new Map((existants ?? []).map((l) => [l.produit_id, Number(l.quantite)]));

  const aMettre: { evenement_id: string; commercial_id: string; produit_id: string; quantite: number }[] = [];
  const aRetirer: string[] = [];
  for (const [cle, valeur] of f.entries()) {
    if (!cle.startsWith("qte_")) continue;
    const produitId = cle.slice("qte_".length);
    const texte = String(valeur).trim().replace(",", ".");
    if (texte === "") {
      if (actuel.has(produitId)) aRetirer.push(produitId);
      continue;
    }
    const quantite = Number(texte);
    if (!Number.isFinite(quantite) || quantite < 0) {
      return { ok: false, erreur: "Une quantité doit être un nombre positif ou nul." };
    }
    if (actuel.get(produitId) !== quantite) {
      aMettre.push({ evenement_id: evenementId, commercial_id: fiche.id, produit_id: produitId, quantite });
    }
  }

  if (aMettre.length > 0) {
    const { error } = await supabase
      .from("stock_depart")
      .upsert(aMettre, { onConflict: "evenement_id,commercial_id,produit_id" });
    if (error) return { ok: false, erreur: "Le stock n'a pas pu être enregistré." };
  }
  for (const produitId of aRetirer) {
    await supabase.from("stock_depart").delete()
      .eq("evenement_id", evenementId).eq("commercial_id", fiche.id).eq("produit_id", produitId);
  }

  revalidatePath("/stock-du-jour");
  if (aMettre.length === 0 && aRetirer.length === 0) {
    return { ok: true, message: "Aucun changement à enregistrer." };
  }
  return { ok: true, message: "Stock enregistré. Il doit maintenant être validé par le gérant ou le chef d'équipe." };
}

// Le commercial confirme le stock déjà validé. Sans validation, la base refuse.
export async function confirmerStock(_etat: EtatStock, f: FormData): Promise<EtatStock> {
  const { supabase, fiche, erreur } = await ficheDuCommercial();
  if (!fiche) return { ok: false, erreur: erreur ?? "Accès refusé." };

  const evenementId = String(f.get("evenement_id") ?? "");
  const { error } = await supabase.rpc("confirmer_stock", { p_evenement: evenementId });
  if (error) return { ok: false, erreur: error.message };

  revalidatePath("/stock-du-jour");
  return { ok: true, message: "Stock confirmé : vous pouvez vendre sur ce lieu." };
}
