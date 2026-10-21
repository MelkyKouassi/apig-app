"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EtatPrimes = { ok: true } | { ok: false; erreur: string } | null;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function gerantConnecte() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, erreur: "Votre session a expiré. Reconnectez-vous." };
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") return { supabase, user: null, erreur: "Seul le gérant peut modifier les primes." };
  return { supabase, user, erreur: null };
}

// Dates de début et de fin d'un événement.
export async function enregistrerDatesEvenement(_etat: EtatPrimes, formData: FormData): Promise<EtatPrimes> {
  const evenementId = String(formData.get("evenement_id") ?? "");
  const debut = String(formData.get("date_debut") ?? "");
  const fin = String(formData.get("date_fin") ?? "");
  if (!evenementId) return { ok: false, erreur: "Choisissez l'événement." };
  if (!DATE.test(debut) || !DATE.test(fin)) return { ok: false, erreur: "Dates invalides." };
  if (fin < debut) return { ok: false, erreur: "La date de fin est avant la date de début." };

  const auth = await gerantConnecte();
  if (auth.erreur) return { ok: false, erreur: auth.erreur };
  const { error } = await auth.supabase
    .from("evenements")
    .update({ date_debut: debut, date_fin: fin })
    .eq("id", evenementId);
  if (error) return { ok: false, erreur: "Les dates n'ont pas pu être enregistrées." };

  revalidatePath("/primes");
  return { ok: true };
}

// Palier d'un barème : standard (événement vide) ou propre à un événement.
export async function ajouterPalier(_etat: EtatPrimes, formData: FormData): Promise<EtatPrimes> {
  const evenementId = String(formData.get("evenement_id") ?? "");
  const seuil = Number(formData.get("seuil_ca") ?? -1);
  const tauxPourcent = Number(formData.get("taux") ?? -1);
  if (!(seuil >= 0)) return { ok: false, erreur: "Le seuil de CA doit être positif ou nul." };
  if (!(tauxPourcent >= 0 && tauxPourcent <= 100)) return { ok: false, erreur: "Le taux doit être entre 0 et 100 %." };

  const auth = await gerantConnecte();
  if (auth.erreur) return { ok: false, erreur: auth.erreur };
  const taux = tauxPourcent / 100;
  const requete = auth.supabase.from("baremes_prime").select("id").eq("seuil_ca", seuil);
  const { data: existants } = await (evenementId ? requete.eq("evenement_id", evenementId) : requete.is("evenement_id", null));
  const { error } = existants && existants.length > 0
    ? await auth.supabase.from("baremes_prime").update({ taux }).eq("id", existants[0].id)
    : await auth.supabase.from("baremes_prime").insert({ evenement_id: evenementId || null, seuil_ca: seuil, taux });
  if (error) return { ok: false, erreur: "Le palier n'a pas pu être enregistré." };

  revalidatePath("/primes");
  return { ok: true };
}

// Anciennes saisies manuelles de ventes par commercial (reprise, R7).
export async function ajouterPrimeManuelle(_etat: EtatPrimes, formData: FormData): Promise<EtatPrimes> {
  const dateSaisie = String(formData.get("date_saisie") ?? "");
  const evenementId = String(formData.get("evenement_id") ?? "");
  const commercialId = String(formData.get("commercial_id") ?? "");
  const montant = Number(formData.get("montant_vendu") ?? -1);
  if (!DATE.test(dateSaisie)) return { ok: false, erreur: "Date invalide." };
  if (!evenementId || !commercialId) return { ok: false, erreur: "Choisissez l'événement et le commercial." };
  if (!(montant >= 0)) return { ok: false, erreur: "Le montant vendu doit être positif ou nul." };

  const auth = await gerantConnecte();
  if (auth.erreur) return { ok: false, erreur: auth.erreur };
  const { error } = await auth.supabase.from("primes_manuelles").insert({
    date_saisie: dateSaisie,
    evenement_id: evenementId,
    commercial_id: commercialId,
    montant_vendu: montant,
  });
  if (error) return { ok: false, erreur: "La saisie n'a pas pu être enregistrée." };

  revalidatePath("/primes");
  return { ok: true };
}
