"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EtatAdmin = { ok: true } | { ok: false; erreur: string } | null;

const ROLES = ["gerant", "comptable", "commercial", "collaboratrice"];
const TAUX = ["dime_defaut", "taux_impot", "reserve_legale_taux", "reserve_plafond_taux", "epargne_taux", "part_distribuee"];
const NOMBRES_POSITIFS = ["coef_pharmacie", "coef_personnel"];
const MONTANTS = ["reserve_deja_constituee", "capital_social"];
const ENTIERS = ["delai_paiement_jours", "seuil_relance_ferme", "seuil_urgent", "delai_credit_jours", "annee_reference"];
const CASES = ["deduire_dime", "reporter_deficits", "reintegrer_remunerations"];

// Vérifie que l'utilisateur est connecté et gérant. La base (RLS) contrôle aussi, ceci sert au message.
async function gerantConnecte(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string } | { erreur: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: "Votre session a expiré. Reconnectez-vous." };
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") return { erreur: "Cette partie est réservée au gérant." };
  return { supabase, userId: user.id };
}

const texte = (f: FormData, nom: string) => {
  const v = String(f.get(nom) ?? "").trim();
  return v === "" ? null : v;
};
const nombre = (f: FormData, nom: string) => {
  const v = Number(String(f.get(nom) ?? "").trim().replace(",", "."));
  return String(f.get(nom) ?? "").trim() !== "" && Number.isFinite(v) ? v : null;
};
const coche = (f: FormData, nom: string) => f.get(nom) === "on";

export async function enregistrerEntreprise(_etat: EtatAdmin, f: FormData): Promise<EtatAdmin> {
  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur };
  const raison = texte(f, "raison_sociale");
  if (!raison) return { ok: false, erreur: "La raison sociale est obligatoire." };

  const { error } = await s.supabase.from("entreprise").update({
    raison_sociale: raison,
    adresse: texte(f, "adresse"),
    ville: texte(f, "ville"),
    telephone: texte(f, "telephone"),
    rccm: texte(f, "rccm"),
    compte_contribuable: texte(f, "compte_contribuable"),
    numero_cnps: texte(f, "numero_cnps"),
    signataire: texte(f, "signataire"),
    signataire_qualite: texte(f, "signataire_qualite"),
    updated_at: new Date().toISOString(),
  }).eq("id", true);
  if (error) return { ok: false, erreur: "Les informations de l'entreprise n'ont pas pu être enregistrées." };

  revalidatePath("/administration");
  revalidatePath("/paie");
  return { ok: true };
}

export async function enregistrerParametres(_etat: EtatAdmin, f: FormData): Promise<EtatAdmin> {
  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur };

  const valeurs: Record<string, number | boolean | null> = {};
  for (const nom of TAUX) {
    const v = nombre(f, nom);
    if (v === null || v < 0 || v > 100) return { ok: false, erreur: "Les taux doivent être compris entre 0 et 100 %." };
    valeurs[nom] = v / 100;
  }
  for (const nom of NOMBRES_POSITIFS) {
    const v = nombre(f, nom);
    if (v === null || v <= 0) return { ok: false, erreur: "Les coefficients doivent être supérieurs à 0." };
    valeurs[nom] = v;
  }
  for (const nom of MONTANTS) {
    const v = nombre(f, nom);
    if (v === null && nom === "capital_social") { valeurs[nom] = null; continue; }
    if (v === null || v < 0) return { ok: false, erreur: "Les montants ne peuvent pas être négatifs." };
    valeurs[nom] = v;
  }
  for (const nom of ENTIERS) {
    const v = nombre(f, nom);
    if (v === null || !Number.isInteger(v) || v < 0) return { ok: false, erreur: "Les délais et seuils doivent être des nombres entiers positifs." };
    valeurs[nom] = v;
  }
  if (!Number.isInteger(valeurs.annee_reference) || (valeurs.annee_reference as number) < 2000 || (valeurs.annee_reference as number) > 2100) {
    return { ok: false, erreur: "L'année de référence n'est pas valide." };
  }
  for (const nom of CASES) valeurs[nom] = coche(f, nom);

  const { error } = await s.supabase.from("parametres").update({ ...valeurs, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) return { ok: false, erreur: "Les paramètres n'ont pas pu être enregistrés." };

  revalidatePath("/administration");
  revalidatePath("/paie");
  revalidatePath("/tableau-de-bord");
  revalidatePath("/creances");
  revalidatePath("/controles");
  return { ok: true };
}

// Relie une fiche de commercial à un compte de connexion (ou la délie si le compte est vide).
export async function enregistrerLienCommercial(_etat: EtatAdmin, f: FormData): Promise<EtatAdmin> {
  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur };
  const commercialId = String(f.get("commercial_id") ?? "");
  const userId = String(f.get("user_id") ?? "");
  if (!commercialId) return { ok: false, erreur: "Commercial introuvable." };

  const { error } = await s.supabase
    .from("commerciaux")
    .update({ user_id: userId || null })
    .eq("id", commercialId);
  if (error) return { ok: false, erreur: "Ce compte est peut-être déjà relié à un autre commercial." };

  revalidatePath("/administration");
  revalidatePath("/ventes/nouvelle");
  revalidatePath("/mes-ventes");
  return { ok: true };
}

export async function enregistrerCollaborateur(_etat: EtatAdmin, f: FormData): Promise<EtatAdmin> {
  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur };

  const id = texte(f, "id");
  const nom = texte(f, "nom");
  if (!nom) return { ok: false, erreur: "Le nom est obligatoire." };
  const parts = nombre(f, "parts");
  if (parts === null || parts <= 0) return { ok: false, erreur: "Le nombre de parts doit être supérieur à 0." };
  const dateEntree = texte(f, "date_entree");
  if (dateEntree && !/^\d{4}-\d{2}-\d{2}$/.test(dateEntree)) return { ok: false, erreur: "Date d'entrée invalide." };

  const valeurs = {
    nom,
    parts,
    matricule: texte(f, "matricule"),
    fonction: texte(f, "fonction"),
    date_entree: dateEntree,
    mode_paiement: texte(f, "mode_paiement"),
    numero_cnps: texte(f, "numero_cnps"),
    user_id: texte(f, "user_id"),
    actif: coche(f, "actif"),
  };
  const requete = id
    ? s.supabase.from("collaborateurs").update(valeurs).eq("id", id)
    : s.supabase.from("collaborateurs").insert(valeurs);
  const { error } = await requete;
  if (error) return { ok: false, erreur: "Le collaborateur n'a pas pu être enregistré (ce nom, ou ce compte, est peut-être déjà utilisé)." };

  revalidatePath("/administration");
  revalidatePath("/paie");
  return { ok: true };
}

export async function enregistrerProfil(_etat: EtatAdmin, f: FormData): Promise<EtatAdmin> {
  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur };

  const id = texte(f, "id");
  const role = texte(f, "role");
  if (!id || !role || !ROLES.includes(role)) return { ok: false, erreur: "Rôle invalide." };
  if (id === s.userId) return { ok: false, erreur: "Vous ne pouvez pas modifier votre propre compte ici." };

  const { error } = await s.supabase.from("profiles").update({ role, actif: coche(f, "actif") }).eq("id", id);
  if (error) return { ok: false, erreur: "Le compte n'a pas pu être modifié." };

  revalidatePath("/administration");
  return { ok: true };
}

// Crée une fiche de commercial. Le compte de connexion est facultatif ; il peut être relié plus tard.
// Le déclencheur de la base affecte alors le nouveau commercial à tous les lieux.
export async function enregistrerNouveauCommercial(_etat: EtatAdmin, f: FormData): Promise<EtatAdmin> {
  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur };
  const nom = texte(f, "nom");
  if (!nom) return { ok: false, erreur: "Indiquez le nom et les prénoms du commercial." };
  const userId = texte(f, "user_id");

  const { error } = await s.supabase.from("commerciaux").insert({ nom, user_id: userId, actif: true });
  if (error) return { ok: false, erreur: "Le commercial n'a pas pu être créé. Le compte choisi est peut-être déjà relié à une autre fiche." };

  revalidatePath("/administration");
  revalidatePath("/validation-stock");
  return { ok: true };
}

// Modifie le nom d'un commercial. Le nouveau nom apparaît partout, y compris dans les anciennes ventes.
export async function enregistrerNomCommercial(_etat: EtatAdmin, f: FormData): Promise<EtatAdmin> {
  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur };
  const commercialId = String(f.get("commercial_id") ?? "");
  const nom = texte(f, "nom");
  if (!commercialId) return { ok: false, erreur: "Commercial introuvable." };
  if (!nom) return { ok: false, erreur: "Le nom ne peut pas être vide." };

  const { error } = await s.supabase.from("commerciaux").update({ nom }).eq("id", commercialId);
  if (error) return { ok: false, erreur: "Le nom n'a pas pu être modifié." };

  revalidatePath("/administration");
  revalidatePath("/validation-stock");
  revalidatePath("/stock-du-jour");
  return { ok: true };
}
