"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES } from "./categories";

export type EtatDepense = { ok: true; message: string } | { ok: false; erreur: string } | null;

const dateValide = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const nombre = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim().replace(",", "."));

// Seuls le gérant et le comptable saisissent ou annulent des dépenses.
async function accesDepenses() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant" && profil?.role !== "comptable") return null;
  return supabase;
}

export async function ajouterDepense(_etat: EtatDepense, f: FormData): Promise<EtatDepense> {
  const supabase = await accesDepenses();
  if (!supabase) return { ok: false, erreur: "Vous n'êtes pas autorisé à saisir des dépenses." };

  const date = String(f.get("date_depense") ?? "");
  const evenementId = String(f.get("evenement_id") ?? "");
  const motif = String(f.get("motif") ?? "").trim();
  const categorie = String(f.get("categorie") ?? "");
  const quantite = nombre(f.get("quantite"));
  const prix = nombre(f.get("prix_unitaire"));

  if (!dateValide(date)) return { ok: false, erreur: "Indiquez la date de la dépense." };
  if (!evenementId) return { ok: false, erreur: "Choisissez le lieu." };
  if (!motif) return { ok: false, erreur: "Indiquez le motif de la dépense." };
  if (!CATEGORIES.some((c) => c.valeur === categorie)) return { ok: false, erreur: "Choisissez la catégorie." };
  if (!(quantite > 0)) return { ok: false, erreur: "La quantité doit être supérieure à 0." };
  if (!Number.isFinite(prix) || prix < 0) return { ok: false, erreur: "Le prix unitaire doit être un nombre positif." };

  const { error } = await supabase.from("depenses").insert({
    date_depense: date, evenement_id: evenementId, motif, categorie, quantite, prix_unitaire: prix,
  });
  if (error) return { ok: false, erreur: "La dépense n'a pas pu être enregistrée." };

  revalidatePath("/depenses");
  revalidatePath("/tableau-de-bord");
  return { ok: true, message: `Dépense enregistrée : ${motif}.` };
}

// Une dépense n'est jamais supprimée : elle passe au statut annulé, avec son motif.
export async function annulerDepense(_etat: EtatDepense, f: FormData): Promise<EtatDepense> {
  const supabase = await accesDepenses();
  if (!supabase) return { ok: false, erreur: "Vous n'êtes pas autorisé à annuler une dépense." };

  const id = String(f.get("id") ?? "");
  const motif = String(f.get("motif") ?? "").trim();
  if (!id) return { ok: false, erreur: "Dépense introuvable." };
  if (!motif) return { ok: false, erreur: "Indiquez le motif de l'annulation." };

  const { data, error } = await supabase
    .from("depenses")
    .update({ statut: "annule", motif_annulation: motif })
    .eq("id", id)
    .eq("statut", "actif")
    .select("id");
  if (error) return { ok: false, erreur: "L'annulation n'a pas pu être enregistrée." };
  if (!data || data.length === 0) return { ok: false, erreur: "Cette dépense est déjà annulée." };

  revalidatePath("/depenses");
  revalidatePath("/tableau-de-bord");
  return { ok: true, message: "Dépense annulée." };
}
