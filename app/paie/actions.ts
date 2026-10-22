"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { chargerPaie } from "@/lib/paie-donnees";

export type EtatVersement = { ok: true } | { ok: false; erreur: string } | null;

// Vérifie que l'utilisateur est le gérant. Renvoie le client et l'identifiant, ou un message d'erreur.
async function gerantConnecte(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string } | { erreur: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: "Votre session a expiré. Reconnectez-vous." };
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") return { erreur: "Seul le gérant peut faire cette action." };
  return { supabase, userId: user.id };
}

// Enregistre un versement à un collaborateur. Réservé au gérant. Contrôle : pas plus que le net à verser.
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
  const nets = (paie.netParMois.get(collaborateurId) ?? []).reduce((s, v) => s + v, 0);
  const verses = paie.versements.filter((v) => v.collaborateur_id === collaborateurId).reduce((s, v) => s + v.montant, 0);
  const reste = nets - verses;
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

// Valide la paie d'un mois : les montants dus sont figés dans les bulletins, visibles par chaque collaborateur.
export async function validerPaieMois(_etat: EtatVersement, formData: FormData): Promise<EtatVersement> {
  const mois = Number(formData.get("mois") ?? 0);
  if (!(mois >= 1 && mois <= 12)) return { ok: false, erreur: "Mois invalide." };

  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur };

  const paie = await chargerPaie(s.supabase);
  if (paie.collaborateurs.length === 0) return { ok: false, erreur: "Aucun collaborateur à valider." };
  const enveloppe = paie.lignes[mois - 1]?.enveloppe ?? 0;
  const maintenant = new Date().toISOString();

  const lignes = paie.collaborateurs.map((c) => ({
    collaborateur_id: c.id,
    annee: paie.annee,
    mois,
    parts: c.parts,
    total_parts: paie.totalParts,
    enveloppe,
    montant_du: (paie.duParMois.get(c.id) ?? [])[mois - 1] ?? 0,
    valide_le: maintenant,
    valide_par: s.userId,
  }));
  const { error } = await s.supabase.from("bulletins").upsert(lignes, { onConflict: "collaborateur_id,annee,mois" });
  if (error) return { ok: false, erreur: "La paie n'a pas pu être validée." };

  revalidatePath("/paie");
  revalidatePath("/mes-bulletins");
  return { ok: true };
}

// Ajoute une retenue facultative sur le bulletin d'un collaborateur pour un mois. Elle ne peut pas dépasser le montant dû.
export async function ajouterRetenue(_etat: EtatVersement, formData: FormData): Promise<EtatVersement> {
  const collaborateurId = String(formData.get("collaborateur_id") ?? "");
  const mois = Number(formData.get("mois") ?? 0);
  const libelle = String(formData.get("libelle") ?? "").trim();
  const montant = Number(formData.get("montant") ?? 0);

  if (!collaborateurId) return { ok: false, erreur: "Choisissez le collaborateur." };
  if (!(mois >= 1 && mois <= 12)) return { ok: false, erreur: "Choisissez le mois concerné." };
  if (!libelle) return { ok: false, erreur: "Indiquez le libellé de la retenue." };
  if (!(montant > 0)) return { ok: false, erreur: "Le montant doit être supérieur à 0." };

  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur };

  const paie = await chargerPaie(s.supabase);
  const du = (paie.duParMois.get(collaborateurId) ?? [])[mois - 1] ?? 0;
  const dejaRetenu = (paie.retenuesParMois.get(collaborateurId) ?? [])[mois - 1] ?? 0;
  const reste = du - dejaRetenu;
  if (montant > reste + 1) {
    return { ok: false, erreur: `La retenue dépasse le montant disponible sur ce bulletin (${Math.round(reste).toLocaleString("fr-FR")} F).` };
  }

  const { error } = await s.supabase.from("retenues_bulletin").insert({
    collaborateur_id: collaborateurId,
    annee: paie.annee,
    mois,
    libelle,
    montant,
    statut: "actif",
    created_by: s.userId,
  });
  if (error) return { ok: false, erreur: "La retenue n'a pas pu être enregistrée." };

  revalidatePath("/paie");
  revalidatePath("/mes-bulletins");
  return { ok: true };
}

// Annule une retenue (rien n'est effacé) : elle ne compte plus dans le net à payer.
export async function annulerRetenue(_etat: EtatVersement, formData: FormData): Promise<EtatVersement> {
  const id = String(formData.get("id") ?? "");
  const motif = String(formData.get("motif") ?? "").trim() || "Annulée par le gérant";
  if (!id) return { ok: false, erreur: "Retenue introuvable." };

  const s = await gerantConnecte();
  if ("erreur" in s) return { ok: false, erreur: s.erreur };

  const { error } = await s.supabase.from("retenues_bulletin").update({ statut: "annule", motif_annulation: motif }).eq("id", id);
  if (error) return { ok: false, erreur: "La retenue n'a pas pu être annulée." };

  revalidatePath("/paie");
  revalidatePath("/mes-bulletins");
  return { ok: true };
}
