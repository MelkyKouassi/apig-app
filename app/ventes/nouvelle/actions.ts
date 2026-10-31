"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { MESSAGE_TELEPHONE, normaliserTelephone, telephoneVide, variantesTelephone } from "@/lib/telephone";

export type ResultatVente =
  | { ok: true; nombre: number; total: number }
  | { ok: false; erreur: string }
  | null;

type LigneSaisie = { produit_id: string; quantite: number; remise_pct?: number | null; remise_fcfa?: number | null };

export async function enregistrerVente(_etat: ResultatVente, formData: FormData): Promise<ResultatVente> {
  const evenementId = String(formData.get("evenement_id") ?? "");
  const dateVente = String(formData.get("date_vente") ?? "");
  const commercialId = String(formData.get("commercial_id") ?? "") || null;
  const modePaiement = String(formData.get("mode_paiement") ?? "comptant");
  const tiersChoisi = String(formData.get("tiers_id") ?? "") || null;
  const nouveauClient = String(formData.get("nouveau_client") ?? "").trim();
  const brutTelephone = String(formData.get("nouveau_telephone") ?? "");
  const indicatifTelephone = String(formData.get("nouveau_indicatif") ?? "225");
  const nouveauTelephone = telephoneVide(brutTelephone) ? null : normaliserTelephone(brutTelephone, indicatifTelephone);
  if (!telephoneVide(brutTelephone) && !nouveauTelephone) return { ok: false, erreur: MESSAGE_TELEPHONE };
  const lignesBrutes = String(formData.get("lignes") ?? "[]");

  if (!evenementId) return { ok: false, erreur: "Choisissez l'événement." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVente)) return { ok: false, erreur: "Date invalide." };
  if (modePaiement !== "comptant" && modePaiement !== "credit") {
    return { ok: false, erreur: "Mode de paiement invalide." };
  }

  let lignes: LigneSaisie[];
  try {
    lignes = JSON.parse(lignesBrutes);
  } catch {
    return { ok: false, erreur: "Les lignes de la vente sont illisibles. Réessayez." };
  }

  const lignesValides = lignes.filter((l) => l.produit_id && Number(l.quantite) > 0);
  if (lignesValides.length === 0) return { ok: false, erreur: "Ajoutez au moins un produit avec une quantité." };

  // Remises : en % entre 0 et 100, en F CFA positives. Une seule des deux par ligne.
  for (const l of lignesValides) {
    const pct = l.remise_pct ?? null;
    const fcfa = l.remise_fcfa ?? null;
    if (pct !== null && (!Number.isFinite(Number(pct)) || Number(pct) < 0 || Number(pct) > 100)) {
      return { ok: false, erreur: "La remise en % doit être comprise entre 0 et 100." };
    }
    if (fcfa !== null && (!Number.isFinite(Number(fcfa)) || Number(fcfa) < 0)) {
      return { ok: false, erreur: "La remise en F CFA ne peut pas être négative." };
    }
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: "Votre session a expiré. Reconnectez-vous." };

  // Un commercial enregistre toujours sous sa propre fiche.
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  let commercialFinal = commercialId;
  if (profil?.role === "commercial") {
    const { data: fiche } = await supabase
      .from("commerciaux")
      .select("id")
      .eq("user_id", user.id)
      .eq("actif", true)
      .maybeSingle();
    if (!fiche) return { ok: false, erreur: "Votre compte n'est pas encore relié à une fiche commercial. Contactez le gérant." };
    commercialFinal = fiche.id;
  }

  // Pour une vente à crédit : client existant, ou nouveau client créé à la volée.
  let tiersId: string | null = null;
  if (modePaiement === "credit") {
    if (tiersChoisi) {
      tiersId = tiersChoisi;
    } else if (nouveauClient) {
      // Même numéro déjà connu : on réutilise la fiche existante au lieu d'en créer une deuxième.
      const { data: deja } = nouveauTelephone
        ? await supabase.from("tiers").select("id").in("telephone", variantesTelephone(nouveauTelephone)).limit(1).maybeSingle()
        : { data: null };
      if (deja) {
        tiersId = deja.id;
      } else {
        const { data: nouveau, error: erreurClient } = await supabase
          .from("tiers")
          .insert({ nom: nouveauClient, telephone: nouveauTelephone, type: "client", created_by: user.id })
          .select("id")
          .single();
        if (erreurClient || !nouveau) {
          return { ok: false, erreur: "Le nouveau client n'a pas pu être créé. Vérifiez le nom." };
        }
        tiersId = nouveau.id;
      }
    } else {
      return { ok: false, erreur: "Pour une vente à crédit, choisissez le client ou saisissez son nom." };
    }
  }

  const panierId = randomUUID();
  const lignesAInserer = lignesValides.map((l) => ({
    panier_id: panierId,
    date_vente: dateVente,
    evenement_id: evenementId,
    produit_id: l.produit_id,
    quantite: Number(l.quantite),
    // La remise en F CFA l'emporte sur celle en % (règle R2) : la base calcule le montant.
    remise_fcfa: l.remise_fcfa != null ? Number(l.remise_fcfa) : null,
    remise_pct: l.remise_fcfa == null && l.remise_pct != null ? Number(l.remise_pct) : null,
    commercial_id: commercialFinal,
    mode_paiement: modePaiement,
    tiers_id: tiersId,
    created_by: user.id,
  }));

  const { data, error } = await supabase.from("ventes").insert(lignesAInserer).select("montant");
  if (error) {
    return { ok: false, erreur: "La vente n'a pas pu être enregistrée. Vérifiez les champs et réessayez." };
  }

  const total = (data ?? []).reduce((somme: number, l: { montant: number | null }) => somme + Number(l.montant ?? 0), 0);
  return { ok: true, nombre: data?.length ?? 0, total };
}
