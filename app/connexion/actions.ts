"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EtatConnexion = { erreur?: string } | null;

export async function seConnecter(_etat: EtatConnexion, formData: FormData): Promise<EtatConnexion> {
  const email = String(formData.get("email") ?? "").trim();
  const motDePasse = String(formData.get("motDePasse") ?? "");

  if (!email || !motDePasse) {
    return { erreur: "Saisissez l'adresse e-mail et le mot de passe." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
  if (error) {
    return { erreur: "Adresse e-mail ou mot de passe incorrect." };
  }

  redirect("/");
}

export async function seDeconnecter() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}
