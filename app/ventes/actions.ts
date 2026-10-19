"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EtatAnnulation = { ok: true } | { ok: false; erreur: string } | null;

// Annule toutes les lignes actives d'un panier. Rien n'est supprimé.
export async function annulerPanier(_etat: EtatAnnulation, formData: FormData): Promise<EtatAnnulation> {
  const panierId = String(formData.get("panier_id") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();

  if (!panierId) return { ok: false, erreur: "Vente introuvable." };
  if (!motif) return { ok: false, erreur: "Indiquez le motif de l'annulation." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: "Votre session a expiré. Reconnectez-vous." };

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") return { ok: false, erreur: "Seul le gérant peut annuler une vente." };

  const { data, error } = await supabase
    .from("ventes")
    .update({ statut: "annule", motif_annulation: motif })
    .eq("panier_id", panierId)
    .eq("statut", "actif")
    .select("id");

  if (error) return { ok: false, erreur: "L'annulation n'a pas pu être enregistrée." };
  if (!data || data.length === 0) return { ok: false, erreur: "Cette vente est déjà annulée." };

  revalidatePath("/ventes");
  return { ok: true };
}
