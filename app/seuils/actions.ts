"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EtatSeuils = { ok: true; message: string } | { ok: false; erreur: string } | null;

// Chaque commercial règle ses propres seuils. Un champ vide supprime le seuil du produit.
export async function enregistrerSeuils(_etat: EtatSeuils, f: FormData): Promise<EtatSeuils> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: "Votre session a expiré. Reconnectez-vous." };

  const { data: fiche } = await supabase
    .from("commerciaux").select("id").eq("user_id", user.id).eq("actif", true).maybeSingle();
  if (!fiche) return { ok: false, erreur: "Votre compte n'est pas relié à une fiche commercial." };

  const aMettreAJour: { commercial_id: string; produit_id: string; seuil: number }[] = [];
  const aSupprimer: string[] = [];
  for (const [cle, valeur] of f.entries()) {
    if (!cle.startsWith("seuil_")) continue;
    const produitId = cle.slice("seuil_".length);
    const texte = String(valeur).trim().replace(",", ".");
    if (texte === "") {
      aSupprimer.push(produitId);
      continue;
    }
    const seuil = Number(texte);
    if (!Number.isFinite(seuil) || seuil < 0) return { ok: false, erreur: "Un seuil doit être un nombre positif ou nul." };
    aMettreAJour.push({ commercial_id: fiche.id, produit_id: produitId, seuil });
  }

  if (aMettreAJour.length > 0) {
    const { error } = await supabase.from("seuils_alerte").upsert(aMettreAJour, { onConflict: "commercial_id,produit_id" });
    if (error) return { ok: false, erreur: "Les seuils n'ont pas pu être enregistrés." };
  }
  for (const produitId of aSupprimer) {
    await supabase.from("seuils_alerte").delete().eq("commercial_id", fiche.id).eq("produit_id", produitId);
  }

  revalidatePath("/seuils");
  return { ok: true, message: "Seuils enregistrés. Ils seront pris en compte à la prochaine mise à jour de la saisie sur ce téléphone." };
}
