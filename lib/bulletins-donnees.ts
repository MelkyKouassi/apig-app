// Assemble les données d'un bulletin de paie.
// Un bulletin validé (snapshot) fait foi. Sans validation, le gérant voit un calcul provisoire en direct.

export type Snapshot = {
  collaborateur_id: string;
  annee: number;
  mois: number;
  parts: number | string;
  total_parts: number | string;
  enveloppe: number | string;
  montant_du: number | string;
  valide_le: string;
};

export type RetenueBulletin = {
  collaborateur_id: string;
  mois: number;
  libelle: string;
  montant: number | string;
  statut: string;
};

export type BulletinMois = {
  valide: boolean;
  valideLe: string | null;
  parts: number;
  totalParts: number;
  enveloppe: number;
  du: number;
  retenues: { libelle: string; montant: number }[];
  retenuesTotal: number;
  net: number;
};

type Calcul = { parts: number; totalParts: number; enveloppe: number; du: number };

// Bulletin d'un collaborateur pour un mois. `calcul` sert seulement sans validation.
export function assemblerBulletin(
  collaborateurId: string,
  mois: number,
  snapshot: Snapshot | undefined,
  calcul: Calcul | null,
  retenues: RetenueBulletin[],
): BulletinMois | null {
  const base = snapshot
    ? { valide: true, valideLe: snapshot.valide_le, parts: Number(snapshot.parts), totalParts: Number(snapshot.total_parts), enveloppe: Number(snapshot.enveloppe), du: Number(snapshot.montant_du) }
    : calcul
      ? { valide: false, valideLe: null, ...calcul }
      : null;
  if (!base) return null;

  const actives = retenues.filter((r) => r.collaborateur_id === collaborateurId && r.mois === mois && r.statut === "actif");
  const lignes = actives.map((r) => ({ libelle: r.libelle, montant: Number(r.montant) }));
  const retenuesTotal = lignes.reduce((s, r) => s + r.montant, 0);
  return { ...base, retenues: lignes, retenuesTotal, net: base.du - retenuesTotal };
}
