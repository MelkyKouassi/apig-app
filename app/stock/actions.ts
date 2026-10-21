"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EtatProduction = { ok: true } | { ok: false; erreur: string } | null;

// Saisit ou corrige la production d'un produit sur un événement. Réservé au gérant.
export async function enregistrerProduction(_etat: EtatProduction, formData: FormData): Promise<EtatProduction> {
  const evenementId = String(formData.get("evenement_id") ?? "");
  const produitId = String(formData.get("produit_id") ?? "");
  const produite = String(formData.get("quantite_produite") ?? "").trim();
  const dons = String(formData.get("dons") ?? "").trim();
  const compte = String(formData.get("stock_physique_compte") ?? "").trim();

  if (!evenementId) return { ok: false, erreur: "Choisissez l'événement." };
  if (!produitId) return { ok: false, erreur: "Choisissez le produit." };
  const q = produite === "" ? 0 : Number(produite);
  const d = dons === "" ? 0 : Number(dons);
  const c = compte === "" ? null : Number(compte);
  if (!(q >= 0)) return { ok: false, erreur: "La quantité produite doit être positive." };
  if (!(d >= 0)) return { ok: false, erreur: "Les dons doivent être positifs." };
  if (c !== null && !(c >= 0)) return { ok: false, erreur: "Le stock compté doit être positif." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: "Votre session a expiré. Reconnectez-vous." };
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") return { ok: false, erreur: "Seul le gérant peut saisir la production." };

  const { error } = await supabase.from("productions").upsert(
    {
      evenement_id: evenementId,
      produit_id: produitId,
      quantite_produite: q,
      dons: d,
      stock_physique_compte: c,
    },
    { onConflict: "evenement_id,produit_id" },
  );
  if (error) return { ok: false, erreur: "La production n'a pas pu être enregistrée." };

  revalidatePath("/stock");
  return { ok: true };
}
