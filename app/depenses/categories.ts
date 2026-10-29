// Catégories de dépenses (même liste que la base de données).
export const CATEGORIES = [
  { valeur: "matieres_premieres_conditionnement", libelle: "Matières premières et conditionnement" },
  { valeur: "transport", libelle: "Transport" },
  { valeur: "remuneration_interessement", libelle: "Rémunération et intéressement" },
  { valeur: "communication_impression", libelle: "Communication et impression" },
  { valeur: "fournitures", libelle: "Fournitures" },
  { valeur: "autre", libelle: "Autre" },
] as const;

export const libelleCategorie = (valeur: string) =>
  CATEGORIES.find((c) => c.valeur === valeur)?.libelle ?? valeur;
