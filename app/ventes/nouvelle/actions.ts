"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";

export type ResultatVente =
  | { ok: true; nombre: number; total: number }
  | { ok: false; erreur: string }
  | null;

type LigneSaisie = { produit_id: string; quantite: number };

export async function enregistrerVente(_etat: ResultatVente, formData: FormData): Promise<ResultatVente> {
  const evenementId = String(formData.get("evenement_id") ?? "");
  const dateVente = String(formData.get("date_vente") ?? "");
  const commercialId = String(formData.get("commercial_id") ?? "") || null;
  const lignesBrutes = String(formData.get("lignes") ?? "[]");

  if (!evenementId) return { ok: false, erreur: "Choisissez l'événement." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVente)) return { ok: false, erreur: "Date invalide." };

  let lignes: LigneSaisie[];
  try {
    lignes = JSON.parse(lignesBrutes);
  } catch {
    return { ok: false, erreur: "Les lignes de la vente sont illisibles. Réessayez." };
  }

  const lignesValides = lignes.filter((l) => l.produit_id && Number(l.quantite) > 0);
  if (lignesValides.length === 0) return { ok: false, erreur: "Ajoutez au moins un produit avec une quantité." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: "Votre session a expiré. Reconnectez-vous." };

  const panierId = randomUUID();
  const lignesAInserer = lignesValides.map((l) => ({
    panier_id: panierId,
    date_vente: dateVente,
    evenement_id: evenementId,
    produit_id: l.produit_id,
    quantite: Number(l.quantite),
    commercial_id: commercialId,
    mode_paiement: "comptant",
    created_by: user.id,
  }));

  const { data, error } = await supabase.from("ventes").insert(lignesAInserer).select("montant");
  if (error) {
    return { ok: false, erreur: "La vente n'a pas pu être enregistrée. Vérifiez l'événement et réessayez." };
  }

  const total = (data ?? []).reduce((somme: number, l: { montant: number | null }) => somme + Number(l.montant ?? 0), 0);
  return { ok: true, nombre: data?.length ?? 0, total };
}
