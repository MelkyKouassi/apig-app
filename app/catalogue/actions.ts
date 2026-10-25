"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EtatCatalogue = { ok: true; message: string } | { ok: false; erreur: string } | null;

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateValide = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const montant = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim().replace(",", "."));

// Vérifie que l'utilisateur est connecté et gérant. La base (RLS) contrôle aussi, ceci sert au message.
async function gerantConnecte() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: "Votre session a expiré. Reconnectez-vous." } as const;
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") return { erreur: "Cette partie est réservée au gérant." } as const;
  return { supabase } as const;
}

// Recalcule le prix des ventes à partir de la date : les montants, le CA, les primes et le dépôt-vente suivent.
async function recalculer(supabase: Awaited<ReturnType<typeof createClient>>, depuis: string) {
  const { error } = await supabase.rpc("recalculer_prix_ventes", { p_depuis: depuis });
  return error;
}

// Nouveau prix (normal ou promotionnel) : une ligne datée. Sans lieu, c'est le prix du produit ; avec un lieu, le prix propre à ce lieu.
export async function enregistrerPrix(_etat: EtatCatalogue, f: FormData): Promise<EtatCatalogue> {
  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur ?? "Accès refusé." };

  const produitId = String(f.get("produit_id") ?? "");
  const date = String(f.get("date_effet") ?? "");
  const evenementId = String(f.get("evenement_id") ?? "");
  const type = String(f.get("type_prix") ?? "normal") === "promotionnel" ? "promotionnel" : "normal";
  const prix = montant(f.get("prix"));

  if (!produitId) return { ok: false, erreur: "Choisissez le produit." };
  if (!dateValide(date)) return { ok: false, erreur: "Indiquez la date d'effet." };
  if (!Number.isFinite(prix) || prix < 0) return { ok: false, erreur: "Le prix doit être un nombre positif." };

  if (evenementId) {
    const { error } = await s.supabase.from("prix_evenement").insert({
      produit_id: produitId, evenement_id: evenementId, date_effet: date, prix_unitaire: prix, type_prix: type,
    });
    if (error) return { ok: false, erreur: "Le prix n'a pas pu être enregistré : il existe peut-être déjà un prix de ce type à cette date pour ce produit et ce lieu." };
  } else {
    const { error } = await s.supabase.from("prix").insert({ produit_id: produitId, date_effet: date, prix_unitaire: prix, type_prix: type });
    if (error) return { ok: false, erreur: "Le prix n'a pas pu être enregistré : il existe peut-être déjà un prix de ce type à cette date pour ce produit." };
    // Le prix de base du catalogue suit le prix normal en vigueur aujourd'hui.
    if (type === "normal" && date <= aujourdhui()) {
      await s.supabase.from("produits").update({ prix_base: prix }).eq("id", produitId);
    }
  }

  const erreurCalcul = await recalculer(s.supabase, date);
  if (erreurCalcul) return { ok: false, erreur: "Le prix est enregistré, mais le recalcul des ventes a échoué. Prévenez l'administrateur." };

  revalidatePath("/catalogue");
  revalidatePath("/saisie");
  revalidatePath("/ventes");
  return { ok: true, message: "Prix enregistré. Les ventes à partir de cette date ont été recalculées." };
}

// Mode de prix appliqué (normal ou promotionnel) à partir d'une date. Concerne tous les produits et tous les lieux.
export async function enregistrerMode(_etat: EtatCatalogue, f: FormData): Promise<EtatCatalogue> {
  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur ?? "Accès refusé." };

  const date = String(f.get("date_effet") ?? "");
  const mode = String(f.get("mode") ?? "") === "promotionnel" ? "promotionnel" : "normal";
  if (!dateValide(date)) return { ok: false, erreur: "Indiquez la date d'effet." };

  const { error } = await s.supabase.from("mode_prix").upsert({ date_effet: date, mode }, { onConflict: "date_effet" });
  if (error) return { ok: false, erreur: "Le mode n'a pas pu être enregistré." };

  const erreurCalcul = await recalculer(s.supabase, date);
  if (erreurCalcul) return { ok: false, erreur: "Le mode est enregistré, mais le recalcul des ventes a échoué. Prévenez l'administrateur." };

  revalidatePath("/catalogue");
  revalidatePath("/saisie");
  revalidatePath("/ventes");
  return { ok: true, message: `Prix appliqué : ${mode === "promotionnel" ? "promotionnel" : "normal"} à partir du ${date}. Les ventes ont été recalculées.` };
}

export async function ajouterProduit(_etat: EtatCatalogue, f: FormData): Promise<EtatCatalogue> {
  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur ?? "Accès refusé." };

  const nom = String(f.get("nom") ?? "").trim();
  const prix = montant(f.get("prix_base"));
  const promo = String(f.get("prix_promotionnel") ?? "").trim() === "" ? null : montant(f.get("prix_promotionnel"));
  const coefficient = montant(f.get("coefficient"));

  if (!nom) return { ok: false, erreur: "Indiquez le nom du produit." };
  if (!Number.isFinite(prix) || prix < 0) return { ok: false, erreur: "Le prix normal doit être un nombre positif." };
  if (promo !== null && (!Number.isFinite(promo) || promo < 0)) return { ok: false, erreur: "Le prix promotionnel doit être un nombre positif." };
  if (!Number.isFinite(coefficient) || coefficient <= 0) return { ok: false, erreur: "Le coefficient de cession doit être supérieur à 0." };

  const { data: produit, error } = await s.supabase
    .from("produits")
    .insert({ nom, prix_base: prix })
    .select("id")
    .single();
  if (error || !produit) return { ok: false, erreur: "Ce produit existe peut-être déjà." };

  await s.supabase.from("prix").insert({ produit_id: produit.id, date_effet: aujourdhui(), prix_unitaire: prix, type_prix: "normal" });
  // Sans prix promotionnel, le produit garde son prix normal dans les deux cas.
  if (promo !== null) {
    await s.supabase.from("prix").insert({ produit_id: produit.id, date_effet: aujourdhui(), prix_unitaire: promo, type_prix: "promotionnel" });
  }
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
