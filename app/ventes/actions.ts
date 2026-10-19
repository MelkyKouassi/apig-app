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
  if (profil?.role !== "gerant" && profil?.role !== "commercial") {
    return { ok: false, erreur: "Vous n'êtes pas autorisé à annuler une vente." };
  }

  const { data, error } = await supabase
    .from("ventes")
    .update({ statut: "annule", motif_annulation: motif })
    .eq("panier_id", panierId)
    .eq("statut", "actif")
    .select("id");

  if (error) return { ok: false, erreur: "L'annulation n'a pas pu être enregistrée." };
  if (!data || data.length === 0) {
    return { ok: false, erreur: "Cette vente est déjà annulée ou ne peut plus être corrigée." };
  }

  revalidatePath("/ventes");
  return { ok: true };
}

export type EtatModification = { ok: true } | { ok: false; erreur: string } | null;

// Modifie le produit et/ou la quantité d'une ligne active. Le prix est recalculé par la base si le produit change.
export async function modifierLigne(_etat: EtatModification, formData: FormData): Promise<EtatModification> {
  const ligneId = String(formData.get("ligne_id") ?? "");
  const produitId = String(formData.get("produit_id") ?? "");
  const quantite = Number(formData.get("quantite") ?? 0);

  if (!ligneId) return { ok: false, erreur: "Ligne introuvable." };
  if (!produitId) return { ok: false, erreur: "Choisissez le produit." };
  if (!(quantite > 0)) return { ok: false, erreur: "La quantité doit être supérieure à 0." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: "Votre session a expiré. Reconnectez-vous." };

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "commercial") {
    return { ok: false, erreur: "Vous n'êtes pas autorisé à modifier cette vente." };
  }

  const { data, error } = await supabase
    .from("ventes")
    .update({ produit_id: produitId, quantite })
    .eq("id", ligneId)
    .eq("statut", "actif")
    .select("id");

  if (error) return { ok: false, erreur: "La modification n'a pas pu être enregistrée." };
  if (!data || data.length === 0) {
    return { ok: false, erreur: "Cette ligne ne peut plus être modifiée (vente annulée ou hors de la période autorisée)." };
  }

  revalidatePath("/ventes");
  revalidatePath("/mes-ventes");
  return { ok: true };
}
