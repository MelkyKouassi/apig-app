"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EtatValidation = { ok: true; message: string } | { ok: false; erreur: string } | null;

// Le gérant, ou le chef d'équipe du lieu, valide le stock d'un commercial.
// La règle (rôle, pas de auto-validation du chef, stock saisi) est vérifiée dans la base.
export async function validerStock(_etat: EtatValidation, f: FormData): Promise<EtatValidation> {
  const supabase = await createClient();
  const evenementId = String(f.get("evenement_id") ?? "");
  const commercialId = String(f.get("commercial_id") ?? "");
  const { error } = await supabase.rpc("valider_stock", { p_evenement: evenementId, p_commercial: commercialId });
  if (error) return { ok: false, erreur: error.message };

  revalidatePath("/validation-stock");
  revalidatePath("/stock-du-jour");
  return { ok: true, message: "Stock validé. Le commercial doit maintenant le confirmer." };
}

// Réservé au gérant : désigne le chef d'équipe du lieu. Champ vide = aucun chef (le gérant valide seul).
export async function definirChef(_etat: EtatValidation, f: FormData): Promise<EtatValidation> {
  const supabase = await createClient();
  const evenementId = String(f.get("evenement_id") ?? "");
  const commercialId = String(f.get("chef_id") ?? "") || null;
  const { error } = await supabase.rpc("definir_chef", { p_evenement: evenementId, p_commercial: commercialId });
  if (error) return { ok: false, erreur: error.message };

  revalidatePath("/validation-stock");
  return { ok: true, message: commercialId ? "Chef d'équipe désigné." : "Aucun chef d'équipe : le gérant valide seul." };
}

// Le gérant, ou le chef d'équipe, valide un complément de stock déclaré par un commercial.
export async function validerMouvement(_etat: EtatValidation, f: FormData): Promise<EtatValidation> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("valider_mouvement_stock", { p_mouvement: String(f.get("mouvement_id") ?? "") });
  if (error) return { ok: false, erreur: error.message };

  revalidatePath("/validation-stock");
  revalidatePath("/stock-du-jour");
  return { ok: true, message: "Complément validé. Il est compté dans le stock du commercial." };
}
