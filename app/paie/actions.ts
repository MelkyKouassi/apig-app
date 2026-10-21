"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { chargerPaie } from "@/lib/paie-donnees";

export type EtatVersement = { ok: true } | { ok: false; erreur: string } | null;

// Enregistre un versement à un collaborateur. Réservé au gérant. Contrôle : pas plus que le reste à verser.
export async function enregistrerVersement(_etat: EtatVersement, formData: FormData): Promise<EtatVersement> {
  const collaborateurId = String(formData.get("collaborateur_id") ?? "");
  const dateVersement = String(formData.get("date_versement") ?? "");
  const mois = Number(formData.get("mois") ?? 0);
  const montant = Number(formData.get("montant") ?? 0);

  if (!collaborateurId) return { ok: false, erreur: "Choisissez le collaborateur." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVersement)) return { ok: false, erreur: "Date invalide." };
  if (!(mois >= 1 && mois <= 12)) return { ok: false, erreur: "Choisissez le mois concerné." };
  if (!(montant > 0)) return { ok: false, erreur: "Le montant doit être supérieur à 0." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: "Votre session a expiré. Reconnectez-vous." };
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") return { ok: false, erreur: "Seul le gérant peut enregistrer un versement." };

  const paie = await chargerPaie(supabase);
  const dus = (paie.duParMois.get(collaborateurId) ?? []).reduce((s, v) => s + v, 0);
  const verses = paie.versements.filter((v) => v.collaborateur_id === collaborateurId).reduce((s, v) => s + v.montant, 0);
  const reste = dus - verses;
  if (montant > reste + 1) {
    return { ok: false, erreur: `Le versement dépasse le reste à verser (${Math.round(reste).toLocaleString("fr-FR")} F).` };
  }

  const { error } = await supabase.from("versements").insert({
    collaborateur_id: collaborateurId,
    date_versement: dateVersement,
    annee: paie.annee,
    mois,
    montant,
    created_by: user.id,
  });
  if (error) return { ok: false, erreur: "Le versement n'a pas pu être enregistré." };

  revalidatePath("/paie");
  return { ok: true };
}
