import { get, set } from "idb-keyval";

// Données de référence copiées sur le téléphone, pour saisir sans réseau.
export type TypePrix = "normal" | "promotionnel";

export type Referentiel = {
  evenements: { id: string; nom: string; est_point_de_vente: boolean | null }[];
  produits: { id: string; nom: string; prix_base: number | null }[];
  prix: { produit_id: string; prix_unitaire: number; date_effet: string; type_prix: TypePrix }[];
  prix_evenement: { produit_id: string; evenement_id: string; prix_unitaire: number; date_effet: string; type_prix: TypePrix }[];
  modes: { date_effet: string; mode: TypePrix }[];
  commerciaux: { id: string; nom: string }[];
  tiers: { id: string; nom: string }[];
  // Stock restant par événement et produit, et seuils d'alerte du commercial (absents des anciennes copies).
  stocks?: { evenement_id: string; produit_id: string; stock_restant: number }[];
  seuils?: { produit_id: string; seuil: number }[];
  // Stock personnel du commercial : quantité emportée par lieu et produit, et ce qu'il a déjà vendu (ventes envoyées).
  stock_personnel?: { evenement_id: string; produit_id: string; quantite: number; vendu: number }[];
  // Lieux où le stock du commercial est validé ET confirmé (seul critère de vente pour un commercial).
  lieux_ouverts?: string[];
  maj: string;
};

export type Profil = { user_id: string; role: string; fiche_id: string | null };

export type VenteEnAttente = {
  id: string; // identifiant du panier
  cree_le: string;
  date_vente: string;
  evenement_id: string;
  mode_paiement: "comptant" | "credit";
  tiers_id: string | null;
  nouveau_client: string | null;
  commercial_id: string | null;
  lignes: { id: string; produit_id: string; quantite: number; remise_pct?: number | null; remise_fcfa?: number | null }[];
};

export const getReferentiel = async () => (await get<Referentiel>("referentiel")) ?? null;
export const setReferentiel = (r: Referentiel) => set("referentiel", r);
export const getProfil = async () => (await get<Profil>("profil")) ?? null;
export const setProfil = (p: Profil) => set("profil", p);
export const getAttente = async () => (await get<VenteEnAttente[]>("attente")) ?? [];
export const setAttente = (liste: VenteEnAttente[]) => set("attente", liste);

// Mode de prix en vigueur à une date (normal par défaut).
function modeA(ref: Referentiel, date: string): TypePrix {
  const m = ref.modes
    .filter((x) => x.date_effet <= date)
    .sort((a, b) => (a.date_effet < b.date_effet ? 1 : -1))[0];
  return m?.mode ?? "normal";
}

// Même règle que la base (fn_prix_vente) : prix du lieu, puis historique, puis prix de base.
// À chaque étape, le prix du mode en vigueur ; sans prix promotionnel, le prix normal s'applique.
export function prixLocal(ref: Referentiel, produitId: string, evenementId: string, date: string): number {
  const type = modeA(ref, date);
  const types: TypePrix[] = type === "normal" ? ["normal"] : [type, "normal"];

  for (const t of types) {
    const prixEvt = ref.prix_evenement
      .filter((p) => p.produit_id === produitId && p.evenement_id === evenementId && p.type_prix === t && p.date_effet <= date)
      .sort((a, b) => (a.date_effet < b.date_effet ? 1 : -1))[0];
    if (prixEvt) return Number(prixEvt.prix_unitaire);
  }

  for (const t of types) {
    const prixDate = ref.prix
      .filter((p) => p.produit_id === produitId && p.type_prix === t && p.date_effet <= date)
      .sort((a, b) => (a.date_effet < b.date_effet ? 1 : -1))[0];
    if (prixDate) return Number(prixDate.prix_unitaire);
  }

  const evenement = ref.evenements.find((e) => e.id === evenementId);
  if (evenement?.est_point_de_vente) return 0;

  const produit = ref.produits.find((p) => p.id === produitId);
  return Number(produit?.prix_base ?? 0);
}
