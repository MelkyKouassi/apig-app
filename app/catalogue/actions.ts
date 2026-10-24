"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EtatCatalogue = { ok: true; message: string } | { ok: false; erreur: string } | null;

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Vérifie que l'utilisateur est connecté et gérant. La base (RLS) contrôle aussi, ceci sert au message.
async function gerantConnecte() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: "Votre session a expiré. Reconnectez-vous." } as const;
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") return { erreur: "Cette partie est réservée au gérant." } as const;
  return { supabase } as const;
}

// Nouveau prix : une ligne datée. Sans événement, c'est le prix de base (historique) ; avec un événement, le prix propre à ce lieu.
export async function enregistrerPrix(_etat: EtatCatalogue, f: FormData): Promise<EtatCatalogue> {
  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur ?? "Accès refusé." };

  const produitId =String(f.get("produit_id") ?? "");
  const date = String(f.get("date_effet") ?? "");
  const evenementId = String(f.get("evenement_id") ?? "");
  const prix = Number(String(f.get("prix") ?? "").trim().replace(",", "."));

  if (!produitId) return { ok: false, erreur: "Choisissez le produit." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, erreur: "Indiquez la date d'effet." };
  if (!Number.isFinite(prix) || prix < 0) return { ok: false, erreur: "Le prix doit être un nombre positif." };

  if (evenementId) {
    const { error } = await s.supabase.from("prix_evenement").insert({
      produit_id: produitId, evenement_id: evenementId, date_effet: date, prix_unitaire: prix,
    });
    if (error) return { ok: false, erreur: "Le prix n'a pas pu être enregistré : il existe peut-être déjà un prix à cette date pour ce produit et ce lieu." };
  } else {
    const { error } = await s.supabase.from("prix").insert({ produit_id: produitId, date_effet: date, prix_unitaire: prix });
    if (error) return { ok: false, erreur: "Le prix n'a pas pu être enregistré : il existe peut-être déjà un prix à cette date pour ce produit." };
    // Le prix de base du catalogue suit le prix en vigueur aujourd'hui.
    if (date <= aujourdhui()) {
      await s.supabase.from("produits").update({ prix_base: prix }).eq("id", produitId);
    }
  }

  revalidatePath("/catalogue");
  revalidatePath("/saisie");
  return { ok: true, message: "Prix enregistré. Les ventes déjà saisies gardent leur prix." };
}

export async function ajouterProduit(_etat: EtatCatalogue, f: FormData): Promise<EtatCatalogue> {
  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur ?? "Accès refusé." };

  const nom =String(f.get("nom") ?? "").trim();
  const prix = Number(String(f.get("prix_base") ?? "").trim().replace(",", "."));
  const coefficient = Number(String(f.get("coefficient") ?? "").trim().replace(",", "."));

  if (!nom) return { ok: false, erreur: "Indiquez le nom du produit." };
  if (!Number.isFinite(prix) || prix < 0) return { ok: false, erreur: "Le prix de base doit être un nombre positif." };
  if (!Number.isFinite(coefficient) || coefficient <= 0) return { ok: false, erreur: "Le coefficient de cession doit être supérieur à 0." };

  const { data: produit, error } = await s.supabase
    .from("produits")
    .insert({ nom, prix_base: prix })
    .select("id")
    .single();
  if (error || !produit) return { ok: false, erreur: "Ce produit existe peut-être déjà." };

  await s.supabase.from("prix").insert({ produit_id: produit.id, date_effet: aujourdhui(), prix_unitaire: prix });
  await s.supabase.from("produit_cession").insert({ produit_id: produit.id, coefficient });

  revalidatePath("/catalogue");
  revalidatePath("/saisie");
  return { ok: true, message: `Produit « ${nom} » ajouté.` };
}

// Un produit qui a des ventes ne se supprime pas : on le désactive ou on le réactive.
export async function basculerProduit(id: string, actif: boolean, _f: FormData): Promise<void> {
  const s = await gerantConnecte();
  if ("erreur" in s) return;
  await s.supabase.from("produits").update({ actif }).eq("id", id);
  revalidatePath("/catalogue");
  revalidatePath("/saisie");
}
