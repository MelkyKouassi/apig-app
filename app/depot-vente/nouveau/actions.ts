"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EtatNouveauDepot = { ok: true } | { ok: false; erreur: string } | null;

const TYPES_DESTINATAIRE = ["pharmacie", "personnel"];

// Nouveau dépôt chez un destinataire (pharmacie ou particulier). Réservé au gérant.
export async function enregistrerNouveauDepot(_etat: EtatNouveauDepot, formData: FormData): Promise<EtatNouveauDepot> {
  const dateRemise = String(formData.get("date_remise") ?? "");
  let tiersId = String(formData.get("tiers_id") ?? "");
  const nouveauNom = String(formData.get("nouveau_nom") ?? "").trim();
  const nouveauType = String(formData.get("nouveau_type") ?? "");
  const produitId = String(formData.get("produit_id") ?? "");
  const confiee = Number(formData.get("quantite_confiee") ?? 0);
  const donnee = Number(formData.get("quantite_donnee") ?? 0);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRemise)) return { ok: false, erreur: "Date invalide." };
  if (!produitId) return { ok: false, erreur: "Choisissez un produit." };
  if (!(confiee > 0)) return { ok: false, erreur: "La quantité confiée doit être supérieure à 0." };
  if (!(donnee >= 0) || donnee > confiee) {
    return { ok: false, erreur: "La quantité donnée doit être entre 0 et la quantité confiée." };
  }
  if (!tiersId && !nouveauNom) return { ok: false, erreur: "Choisissez un destinataire ou saisissez un nouveau nom." };
  if (!tiersId && !TYPES_DESTINATAIRE.includes(nouveauType)) {
    return { ok: false, erreur: "Indiquez le type du nouveau destinataire." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: "Votre session a expiré. Reconnectez-vous." };

  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profil?.role !== "gerant") return { ok: false, erreur: "Seul le gérant peut créer un dépôt." };

  // Contrôle : un prix de détail doit exister à la date de remise, sinon le montant serait nul.
  const { data: prixDetail } = await supabase.rpc("prix_detail_a_date", { p_produit: produitId, p_date: dateRemise });
  if (!(Number(prixDetail) > 0)) {
    return { ok: false, erreur: "Aucun prix de détail pour ce produit à cette date. Vérifiez les prix dans Supabase." };
  }

  if (!tiersId) {
    const { data: nouveau, error: errTiers } = await supabase
      .from("tiers")
      .insert({ nom: nouveauNom, type: nouveauType, created_by: user.id })
      .select("id")
      .single();
    if (errTiers || !nouveau) {
      return { ok: false, erreur: "Ce nom de destinataire existe déjà : choisissez-le dans la liste." };
    }
    tiersId = nouveau.id;
  }

  const { error } = await supabase.from("depots").insert({
    date_remise: dateRemise,
    tiers_id: tiersId,
    produit_id: produitId,
    quantite_confiee: confiee,
    quantite_donnee: donnee,
    created_by: user.id,
  });
  if (error) return { ok: false, erreur: "Le dépôt n'a pas pu être enregistré." };

  revalidatePath("/depot-vente");
  return { ok: true };
}
